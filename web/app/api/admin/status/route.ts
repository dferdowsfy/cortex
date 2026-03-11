/**
 * GET /api/admin/status
 *
 * Production verification + debug status panel.
 * Reports exactly what environment / build / inference path is active so you
 * can verify whether production is using the remote Ollama model or not.
 *
 * Auth: Requires X-Admin-Key header (or ?key= param) matching ADMIN_SECRET_KEY.
 *       Bypassed entirely when DEBUG_BYPASS is set (dev-only).
 *
 * Returns:
 *   deployment     — build metadata (version, timestamp, env)
 *   ollama_config  — which host/model env vars are in effect
 *   ollama_health  — whether GET ${OLLAMA_BASE_URL}/api/tags responds
 *   ollama_inference — whether a minimal analysePrompt() call succeeds
 *   rtdb           — whether Firebase Realtime Database is reachable
 *   inference_path — summary of how prompts are actually being analysed
 */

import { NextRequest, NextResponse } from "next/server";
import { analysePrompt } from "@/lib/ollamaAnalysis";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
    if (process.env.DEBUG_BYPASS) return true;
    const key = req.headers.get("X-Admin-Key") || req.nextUrl.searchParams.get("key");
    return Boolean(key && key === process.env.ADMIN_SECRET_KEY);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function checkOllamaHealth(baseUrl: string): Promise<{
    ok: boolean;
    status?: number;
    models?: string[];
    error?: string;
    latency_ms?: number;
}> {
    const t0 = Date.now();
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        let res: Response;
        try {
            res = await fetch(`${baseUrl}/api/tags`, {
                method: "GET",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
        const latency_ms = Date.now() - t0;
        if (!res.ok) {
            return { ok: false, status: res.status, latency_ms, error: await res.text().catch(() => "(unreadable)") };
        }
        const data = await res.json() as { models?: Array<{ name: string }> };
        return {
            ok: true,
            status: res.status,
            latency_ms,
            models: (data.models || []).map((m) => m.name),
        };
    } catch (e) {
        return {
            ok: false,
            latency_ms: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

async function checkOllamaInference(skip: boolean): Promise<{
    attempted: boolean;
    ok?: boolean;
    latency_ms?: number;
    risk_score?: number;
    severity?: string;
    error?: string;
    error_code?: string;
}> {
    if (skip) return { attempted: false };
    const t0 = Date.now();
    try {
        const result = await analysePrompt({
            promptText: "Summarise our internal runbook. My AWS key is AKIAIOSFODNN7EXAMPLE.",
            attachmentPresent: false,
            metadata: { ai_tool: "StatusCheck", test: "true" },
        });
        return {
            attempted: true,
            ok: true,
            latency_ms: Date.now() - t0,
            risk_score: result.overall_risk_score,
            severity: result.severity,
        };
    } catch (e) {
        return {
            attempted: true,
            ok: false,
            latency_ms: Date.now() - t0,
            error_code: (e as { code?: string }).code ?? "UNKNOWN",
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

async function checkRtdb(): Promise<{
    configured: boolean;
    ok?: boolean;
    error?: string;
}> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { adminDb } = require("@/lib/firebase/admin");
        if (!adminDb) return { configured: false };
        // Lightweight probe — read a non-existent path; success means RTDB is reachable.
        await adminDb.ref("__status_probe__").get();
        return { configured: true, ok: true };
    } catch (e) {
        return {
            configured: true,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const skipInference = req.nextUrl.searchParams.get("skip_inference") === "1";

    // Read Ollama config from env — exactly what production is using
    const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "").trim().replace(/\/$/, "");
    const ollamaModel = (process.env.OLLAMA_MODEL || "").trim();
    const ollamaTimeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || "60000", 10);

    const ollamaConfigOk = Boolean(ollamaBaseUrl && ollamaModel);

    const started = Date.now();

    // Run health + RTDB checks in parallel; inference only if health passes
    const [health, rtdb] = await Promise.all([
        ollamaConfigOk ? checkOllamaHealth(ollamaBaseUrl) : Promise.resolve({ ok: false, error: "OLLAMA_BASE_URL or OLLAMA_MODEL not set" }),
        checkRtdb(),
    ]);

    // Only run inference check if health passed (avoids double-timeout hit)
    const inference = await checkOllamaInference(skipInference || !health.ok);

    const elapsed = Date.now() - started;
    const allOk = health.ok && (inference.ok !== false);

    return NextResponse.json(
        {
            ok: allOk,
            elapsed_ms: elapsed,
            timestamp: new Date().toISOString(),

            // ── Deployment metadata ────────────────────────────────────────────
            deployment: {
                node_env: process.env.NODE_ENV || "unknown",
                // VERCEL_GIT_COMMIT_SHA and VERCEL_ENV are injected automatically
                // by Vercel at build time. If missing, we're running locally.
                vercel_env: process.env.VERCEL_ENV || "not_vercel",
                vercel_git_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
                vercel_deployment_url: process.env.VERCEL_URL || null,
                vercel_git_branch: process.env.VERCEL_GIT_COMMIT_REF || null,
                vercel_region: process.env.VERCEL_REGION || null,
                // NEXT_PUBLIC_APP_VERSION can be set in package.json via env baking
                app_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
                built_at: process.env.BUILD_TIMESTAMP || null,
            },

            // ── Ollama configuration (exactly what the running code will use) ──
            ollama_config: {
                base_url: ollamaBaseUrl || null,
                model: ollamaModel || null,
                timeout_ms: ollamaTimeoutMs,
                config_complete: ollamaConfigOk,
                // Surface whether the URL looks like a remote VPS vs localhost
                is_remote: ollamaBaseUrl
                    ? !ollamaBaseUrl.includes("localhost") && !ollamaBaseUrl.includes("127.0.0.1")
                    : null,
            },

            // ── Ollama health check ────────────────────────────────────────────
            ollama_health: health,

            // ── Ollama inference smoke test ────────────────────────────────────
            // (omit if skip_inference=1 to speed up the check)
            ollama_inference: inference,

            // ── Firebase RTDB ─────────────────────────────────────────────────
            // If RTDB is not configured, events fall back to in-memory storage.
            // In-memory storage is NOT durable across Vercel serverless instances —
            // this means dashboard feed can lose events. Configure RTDB to fix it.
            rtdb,

            // ── Inference path summary ─────────────────────────────────────────
            // Human-readable summary of the actual production request flow.
            inference_path: {
                prompt_analysis: ollamaConfigOk
                    ? `POST ${ollamaBaseUrl}/api/generate → model=${ollamaModel}`
                    : "MISCONFIGURED — OLLAMA_BASE_URL or OLLAMA_MODEL not set",
                policy_decision: "backend: /api/scanPrompt computePolicyDecision()",
                event_storage: rtdb.ok
                    ? "Firebase RTDB → workspaces/{orgId}/proxy_events/{eventId}"
                    : "IN-MEMORY FALLBACK (non-persistent — configure Firebase RTDB for production)",
                extension_sync: "SCAN_PROMPT → /api/scanPrompt → stores event → /api/proxy/activity reads same workspace",
            },
        },
        { status: allOk ? 200 : 502 },
    );
}
