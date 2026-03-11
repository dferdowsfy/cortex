import { NextRequest, NextResponse } from "next/server";
import { analysePrompt, COMPLYZE_SCHEMA } from "@/lib/ollamaAnalysis";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Ollama connectivity + inference test route.
 *
 * Why port 11434?
 *   11434 is the native port that Ollama binds to by default. The Ollama
 *   server is hosted on a REMOTE VPS (not localhost). Port 11434 is
 *   reachable over the public internet. If you later place nginx/Caddy/
 *   Cloudflare Tunnel in front, update OLLAMA_BASE_URL and the port
 *   disappears from the URL automatically — no code change needed.
 *
 * Required env vars (no defaults — must be explicit):
 *   OLLAMA_BASE_URL    e.g. http://72.62.83.236:11434
 *   OLLAMA_MODEL       e.g. complyze-qwen
 *   OLLAMA_TIMEOUT_MS  e.g. 60000 (optional, defaults to 60000)
 *
 * Access:
 *   GET  /api/admin/test-ollama              — health + inference test
 *   POST /api/admin/test-ollama              — custom prompt test
 *
 * Auth:
 *   Requires X-Admin-Key header or ?key= param matching ADMIN_SECRET_KEY.
 *   Bypassed entirely when DEBUG_BYPASS env var is set (dev-only).
 */

function getOllamaBaseUrl(): string {
    const url = (process.env.OLLAMA_BASE_URL || "").trim().replace(/\/$/, "");
    if (!url) {
        throw new Error("OLLAMA_BASE_URL is not set in environment variables.");
    }
    return url;
}

function getOllamaModel(): string {
    const model = (process.env.OLLAMA_MODEL || "").trim();
    if (!model) {
        throw new Error("OLLAMA_MODEL is not set in environment variables.");
    }
    return model;
}

function isAuthorised(req: NextRequest): boolean {
    if (process.env.DEBUG_BYPASS) return true;
    const adminKey = req.headers.get("X-Admin-Key") || req.nextUrl.searchParams.get("key");
    return adminKey !== null && adminKey === process.env.ADMIN_SECRET_KEY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Health check: GET ${OLLAMA_BASE_URL}/api/tags
// ─────────────────────────────────────────────────────────────────────────────

async function checkHealth(baseUrl: string): Promise<{
    ok: boolean;
    status?: number;
    models?: string[];
    error?: string;
}> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        let res: Response;
        try {
            res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }

        if (!res.ok) {
            return { ok: false, status: res.status, error: await res.text().catch(() => "(unreadable)") };
        }

        const data = await res.json() as { models?: Array<{ name: string }> };
        const models = (data.models || []).map((m) => m.name);
        return { ok: true, status: res.status, models };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — health probe + canned inference test
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let baseUrl: string;
    let model: string;
    try {
        baseUrl = getOllamaBaseUrl();
        model = getOllamaModel();
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }

    const started = Date.now();

    // ── Step 1: Health check ──────────────────────────────────────────────────
    const health = await checkHealth(baseUrl);

    // ── Step 2: Inference smoke test ──────────────────────────────────────────
    let inference: Record<string, unknown> = { attempted: false };

    if (health.ok) {
        try {
            const result = await analysePrompt({
                promptText:
                    "Summarise our internal deployment runbook. " +
                    "Also, here is my AWS key: AKIAIOSFODNN7EXAMPLE and SSN: 123-45-6789.",
                attachmentPresent: false,
                metadata: { ai_tool: "TestRunner", test: "true" },
            });

            inference = {
                attempted: true,
                ok: true,
                overall_risk_score: result.overall_risk_score,
                severity: result.severity,
                recommended_action: result.recommended_action,
                confidence: result.confidence,
                findings_count: result.findings.length,
                sensitive_categories: result.sensitive_categories,
                contextual_risks: result.contextual_risks,
                dashboard_metrics: result.dashboard_metrics,
                graph_data: result.graph_data,
                full_result: result,
            };
        } catch (e) {
            const code =
                e && typeof (e as { code?: string }).code === "string"
                    ? (e as { code: string }).code
                    : "UNKNOWN";
            inference = {
                attempted: true,
                ok: false,
                error_code: code,
                error_message: e instanceof Error ? e.message : String(e),
            };
        }
    }

    const elapsed = Date.now() - started;
    const allOk = health.ok && (inference as { ok?: boolean }).ok === true;

    return NextResponse.json(
        {
            ok: allOk,
            elapsed_ms: elapsed,
            config: {
                ollama_base_url: baseUrl,
                // Note: port 11434 is Ollama's native port on the remote VPS.
                // It is NOT localhost. Update OLLAMA_BASE_URL to change host/port.
                model,
                timeout_ms: parseInt(process.env.OLLAMA_TIMEOUT_MS || "60000", 10),
            },
            health_check: health,
            inference_test: inference,
            schema_required_fields: COMPLYZE_SCHEMA.required,
        },
        { status: allOk ? 200 : 502 },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — custom prompt test
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let baseUrl: string;
    let model: string;
    try {
        baseUrl = getOllamaBaseUrl();
        model = getOllamaModel();
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }

    const body = await req.json();
    const promptText: string = body.prompt || "Hello, this is a test prompt.";
    const started = Date.now();

    try {
        const result = await analysePrompt({
            promptText,
            attachmentPresent: body.attachmentPresent === true,
            attachmentType: body.attachmentType,
            attachmentText: body.attachmentText,
            metadata: { ai_tool: "TestRunner", test: "true" },
        });

        return NextResponse.json({
            ok: true,
            elapsed_ms: Date.now() - started,
            config: { ollama_base_url: baseUrl, model },
            schema_required_fields: COMPLYZE_SCHEMA.required,
            result,
        });
    } catch (e) {
        const code =
            e && typeof (e as { code?: string }).code === "string"
                ? (e as { code: string }).code
                : "UNKNOWN";
        return NextResponse.json(
            {
                ok: false,
                elapsed_ms: Date.now() - started,
                config: { ollama_base_url: baseUrl, model },
                error_code: code,
                error_message: e instanceof Error ? e.message : String(e),
            },
            { status: 502 },
        );
    }
}
