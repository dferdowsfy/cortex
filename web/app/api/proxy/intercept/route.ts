/**
 * /api/proxy/intercept — POST
 * The proxy endpoint. Receives AI requests, analyses them via local Ollama,
 * logs activity events, applies policy based on enforcement_mode, and forwards to the AI provider.
 *
 * ALL risk decisions originate from the local Ollama LLM — regex is NEVER the
 * decision source. The proxy-classifier is used only for lightweight metadata
 * extraction (tool identification, token estimation) — not for enforcement.
 *
 * Enforcement modes (read from settings, single source of truth):
 *   monitor → allow request, log event only
 *   warn    → return warning response, allow override
 *   redact  → sanitize sensitive content before forwarding
 *   block   → prevent request, return structured error
 */
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import store from "@/lib/proxy-store";
import {
    estimateTokens,
    hashString,
    extractToolDomain,
    identifyTool,
    redactSensitiveContent,
} from "@/lib/proxy-classifier";
import {
    analysePrompt,
    buildFallbackResult,
    type ComplyzeAnalysisResult,
} from "@/lib/ollamaAnalysis";
import type { ActivityEvent, EnforcementMode } from "@/lib/proxy-types";

export const maxDuration = 120;

const VALID_ENFORCEMENT_MODES: EnforcementMode[] = ["monitor", "warn", "redact", "block"];

/**
 * Resolve the effective enforcement mode from settings.
 * Uses enforcement_mode as canonical source; falls back to legacy boolean flags.
 */
function resolveEnforcementMode(settings: {
    enforcement_mode?: EnforcementMode;
    block_high_risk?: boolean;
    redact_sensitive?: boolean;
}): EnforcementMode {
    if (settings.enforcement_mode && VALID_ENFORCEMENT_MODES.includes(settings.enforcement_mode)) {
        return settings.enforcement_mode;
    }
    // Legacy fallback
    if (settings.block_high_risk) return "block";
    if (settings.redact_sensitive) return "redact";
    return "monitor";
}

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const queryWorkspaceId = searchParams.get("workspaceId");

    try {
        const body = await req.json();
        const workspaceId = body.workspace_id || queryWorkspaceId || "default";
        const settings = await store.getSettings(workspaceId);

        const {
            target_url,
            method,
            headers: reqHeaders,
            body: reqBody,
            user_id,
            log_only,
        } = body;

        // In log_only mode (from the local proxy server), we skip the
        // proxy_enabled check because the proxy itself is the source.
        // For direct API calls, we still require proxy_enabled.
        if (!log_only && !settings.proxy_enabled) {
            return NextResponse.json(
                { error: "Proxy monitoring is not enabled" },
                { status: 403 }
            );
        }

        if (!target_url) {
            return NextResponse.json(
                { error: "Missing required field: target_url" },
                { status: 400 }
            );
        }

        const contentToClassify = reqBody || "";
        const startTime = Date.now();

        // ── 1. Capture metadata (lightweight, no regex enforcement) ──
        const domain = extractToolDomain(target_url);
        const tool = identifyTool(domain);
        const userHash = hashString(user_id || "anonymous");
        const promptHash = hashString(contentToClassify);
        const promptLength = contentToClassify.length;
        const tokenEstimate = estimateTokens(contentToClassify);

        // ── 2. DETECTION: Call local Ollama for LLM-based risk analysis ──
        // Regex-based classifyContent() is NOT used for enforcement decisions.
        // All risk scoring originates exclusively from the local Ollama model.
        let analysis: ComplyzeAnalysisResult;
        let ollamaWasCalled = false;
        try {
            analysis = await analysePrompt({
                promptText: contentToClassify,
                metadata: {
                    ai_tool: tool,
                    target_url,
                    user_id: user_id || "anonymous",
                },
            });
            ollamaWasCalled = true;
            console.log(`[proxy/intercept] Ollama analysis: score=${analysis.overall_risk_score} severity=${analysis.severity} action=${analysis.suggested_action}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[proxy/intercept] Ollama analysis failed:", msg);
            analysis = buildFallbackResult(msg);
            // Fallback result: allow with warning (do not block without LLM confirmation)
        }

        // ── 3. POLICY EVALUATION: Read enforcement mode from settings ──
        const activeMode = resolveEnforcementMode(settings);

        // Determine sensitivity solely from Ollama output
        const riskScore = analysis.overall_risk_score;
        const isSensitive = riskScore >= 46 || analysis.severity === "high" || analysis.severity === "critical";
        const isCritical = riskScore >= 76 || analysis.severity === "critical";

        // ── 4. Generate structured activity event ──
        let apiEndpoint = "/";
        try {
            apiEndpoint = new URL(target_url).pathname;
        } catch {
            apiEndpoint = target_url;
        }

        const event: ActivityEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tool,
            tool_domain: domain,
            user_hash: userHash,
            prompt_hash: promptHash,
            prompt_length: promptLength,
            token_count_estimate: tokenEstimate,
            api_endpoint: apiEndpoint,
            sensitivity_score: riskScore,
            sensitivity_categories: analysis.sensitive_categories as any,
            policy_violation_flag: isCritical,
            risk_category: analysis.severity,
            timestamp: new Date().toISOString(),
            attachment_inspection_enabled: settings.inspect_attachments,

            // Decision attribution — Ollama model was consulted for the decision
            decision_source: "backend_policy",
            model_used: ollamaWasCalled,
            policy_used: true,
            blocked_locally: false,
            analysis_score: riskScore,
            contextual_risks: analysis.contextual_risks,
            provider: tool,
        };

        // Store full prompt only in Full Audit Mode
        if (settings.full_audit_mode) {
            event.full_prompt = contentToClassify;
        }

        // Mark blocked status only if enforcement mode is 'block' and Ollama flagged critical
        if (activeMode === "block" && isCritical) {
            event.blocked = true;
        }

        // Record the enforcement action taken
        if (isSensitive) {
            event.enforcement_action = activeMode;
        }

        // Log the event
        await store.addEvent(event, workspaceId);

        const processingTime = Date.now() - startTime;

        // ── 5. Structured enforcement log ──
        console.log(JSON.stringify({
            event: "enforcement_decision",
            timestamp: new Date().toISOString(),
            event_id: event.id,
            tool,
            detection_result: analysis.severity,
            sensitivity_score: riskScore,
            categories: analysis.sensitive_categories,
            policy_violation: isCritical,
            suggested_action: analysis.suggested_action,
            enforcement_mode: activeMode,
            enforcement_action: isSensitive ? activeMode : "allow",
            model_used: ollamaWasCalled,
            processing_time_ms: processingTime,
        }));

        // ── 6. Log-only mode: return immediately (used by proxy server) ──
        if (log_only) {
            return NextResponse.json({
                logged: true,
                event_id: event.id,
                tool,
                sensitivity_score: riskScore,
                risk_category: analysis.severity,
                categories: analysis.sensitive_categories,
                suggested_action: analysis.suggested_action,
                enforcement_mode: activeMode,
                model_used: ollamaWasCalled,
                processing_time_ms: processingTime,
            });
        }

        // ── 7. ENFORCEMENT: Apply action based on Ollama output + policy mode ──
        // Decision source: Ollama risk score + enforcement mode from settings.
        // Regex patterns have NO role in enforcement decisions.

        if (isSensitive && isCritical) {
            switch (activeMode) {
                case "block": {
                    return NextResponse.json({
                        blocked: true,
                        reason: `Prompt blocked by policy: Ollama risk score ${riskScore}/100 (${analysis.severity}) — ${analysis.sensitive_categories.join(", ") || "sensitive content"}`,
                        enforcement_mode: "block",
                        analysis: {
                            sensitivity_score: riskScore,
                            severity: analysis.severity,
                            categories: analysis.sensitive_categories,
                            suggested_action: analysis.suggested_action,
                        },
                        event_id: event.id,
                        model_used: ollamaWasCalled,
                        processing_time_ms: processingTime,
                    }, { status: 403 });
                }

                case "warn": {
                    return NextResponse.json({
                        warning: true,
                        reason: `Sensitive content detected by Ollama (score ${riskScore}/100) — review before proceeding`,
                        enforcement_mode: "warn",
                        override_allowed: true,
                        analysis: {
                            sensitivity_score: riskScore,
                            severity: analysis.severity,
                            categories: analysis.sensitive_categories,
                            suggested_action: analysis.suggested_action,
                        },
                        event_id: event.id,
                        model_used: ollamaWasCalled,
                        processing_time_ms: processingTime,
                    }, { status: 299 });
                }

                case "redact":
                    // Fall through to forwarding — redaction applied below
                    break;

                case "monitor":
                default:
                    // Fall through to forwarding — no enforcement action
                    break;
            }
        }

        // ── 8. Prepare forwarded body ──
        // Use Ollama's redacted_prompt if available, otherwise apply local redaction.
        let forwardBody = contentToClassify;
        if (activeMode === "redact" && isSensitive) {
            forwardBody = analysis.redacted_prompt && analysis.redacted_prompt.trim()
                ? analysis.redacted_prompt
                : redactSensitiveContent(contentToClassify);
        }

        // ── 9. Forward to original AI provider ──
        const forwardHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...(reqHeaders || {}),
        };

        const aiResponse = await fetch(target_url, {
            method: method || "POST",
            headers: forwardHeaders,
            body: forwardBody,
        });

        const aiData = await aiResponse.text();

        // ── 10. Return response to user with metadata ──
        return new NextResponse(aiData, {
            status: aiResponse.status,
            headers: {
                "Content-Type": aiResponse.headers.get("Content-Type") || "application/json",
                "X-Complyze-Event-Id": event.id,
                "X-Complyze-Sensitivity": riskScore.toString(),
                "X-Complyze-Enforcement": activeMode,
                "X-Complyze-Processing-Ms": (Date.now() - startTime).toString(),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Proxy error";
        console.error("[/api/proxy/intercept]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
