import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { resolveSessionContext } from "@/lib/session-context";
import { resolveEffectivePolicy } from "@/lib/policy-resolver";
import {
    analysePrompt,
    buildFallbackResult,
    type ComplyzeAnalysisResult,
    type OllamaAnalysisError,
} from "@/lib/ollamaAnalysis";
import store from "@/lib/proxy-store";
import type { ActivityEvent } from "@/lib/proxy-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/scanPrompt
 *
 * Evaluates a submitted prompt against active group/org policies via the
 * locally-hosted Ollama model (http://localhost:11434 by default).
 * ALL risk decisions originate from the LLM — regex is never the decision source.
 *
 * Accepts:
 *   promptText | prompt  — the raw prompt to evaluate
 *   aiTool               — name of the destination AI service
 *   workspaceId          — organisation workspace identifier
 *   orgId                — organisation ID (also accepted from X-Organization-ID header)
 *   userEmail            — submitting user email (also from X-User-Email header)
 *   context              — optional additional context strings
 *   cachedPolicies       — array of policy rules cached by the extension
 *   attachmentPresent    — boolean
 *   attachmentType       — MIME / descriptive type
 *   attachmentText       — extracted attachment content
 *
 * Returns fields expected by the existing dashboard + extension consumers.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const promptText: string = body.promptText || body.prompt || "";
        const aiTool: string = body.aiTool || "Unknown Tool";
        const context: string | string[] = body.context || "";

        const authHeader: string | null = req.headers.get("Authorization");
        const session = await resolveSessionContext(req);
        const orgId: string | null = session?.organizationId || req.headers.get("X-Organization-ID") || body.orgId || null;
        const userEmail: string | null = session?.email || req.headers.get("X-User-Email") || body.userEmail || null;
        const workspaceId: string = orgId || body.workspaceId || "default";

        if (!promptText) {
            return NextResponse.json({ error: "promptText is required" }, { status: 400 });
        }

        // ── Auth token check ──────────────────────────────────────────────────────
        if (!process.env.DEBUG_BYPASS) {
            if (orgId && authHeader && authHeader.startsWith("Bearer ")) {
                const tokenValue = authHeader.replace("Bearer ", "").trim();
                const token = await enrollmentStore.getToken(tokenValue, workspaceId);
                if (!token || token.org_id !== orgId || token.revoked) {
                    return NextResponse.json(
                        { error: "Unauthorized: Invalid deployment token" },
                        { status: 401 },
                    );
                }
            } else if (!orgId) {
                return NextResponse.json(
                    { error: "Unauthorized: Missing identity headers" },
                    { status: 401 },
                );
            }
        }

        // ── Policy rule resolution ─────────────────────────────────────────────────
        let rules: unknown[] = [];
        let orgPolicyConfig: any = null;

        if (Array.isArray(body.cachedPolicies) && body.cachedPolicies.length > 0) {
            rules = body.cachedPolicies;
            console.log(`[scanPrompt] Using ${rules.length} extension-cached policy rules.`);
        } else if (orgId) {
            const effective = await resolveEffectivePolicy({
                organizationId: orgId,
                userId: session?.userId || body.user_id,
                email: userEmail || undefined,
                workspaceId: "default",
            });
            orgPolicyConfig = effective.resolvedPolicy;
            rules = effective.resolvedPolicy.rules || [];
            console.log(`[scanPrompt] Resolved effective policy version=${effective.policyVersion} rules=${rules.length}`);
        }

// ── Build context string ───────────────────────────────────────────────────
        const contextStr = Array.isArray(context) ? context.join("\n---\n") : context;

        // ── Dispatch to local Ollama for analysis ─────────────────────────────────
        // Regex-based DLP patterns are NOT used for enforcement decisions.
        // All risk scoring and action decisions must originate from the LLM.
        // hasCritical is always false — the policy engine must not block based on regex.
        const hasCritical = false;

        console.log(`[Complyze] Prompt intercepted: ${aiTool} (prompt size: ${promptText.length})`);
        console.log(`[Complyze] Sending prompt to Ollama`);
        console.log(`[Complyze] Ollama endpoint: ${process.env.OLLAMA_BASE_URL || '(not set)'}`);
        console.log(`[Complyze] Model used: ${process.env.OLLAMA_MODEL || '(not set)'}`);
        let analysisResult: ComplyzeAnalysisResult;
        let analysisError: OllamaAnalysisError | null = null;

        try {
            analysisResult = await analysePrompt({
                promptText: contextStr ? `${contextStr}\n\n${promptText}` : promptText,
                attachmentPresent: body.attachmentPresent === true,
                attachmentType: body.attachmentType || undefined,
                attachmentText: body.attachmentText || undefined,
                policyRules: rules.length > 0 ? rules : undefined,
                metadata: {
                    ai_tool: aiTool,
                    ...(orgId ? { org_id: orgId } : {}),
                    ...(userEmail ? { user_email: userEmail } : {}),
                },
            });
        } catch (err) {
            const typed = err as Partial<OllamaAnalysisError>;
            analysisError = {
                code: typed.code ?? "UNKNOWN",
                message: err instanceof Error ? err.message : String(err),
                raw: typed.raw,
            };
            console.error(`[scanPrompt] Ollama analysis failed (${analysisError.code}):`, analysisError.message);

            // ── Stage 2 Failure: Apply Configurable Fallback Policy ──────────
            const fallbackAction = orgPolicyConfig?.fallback_policy || "warn";
            
            let finalAction: "block" | "redact" | "audit" | "warn" = "warn";
            let reason = "";

            if (fallbackAction === "block") {
                finalAction = "block";
                reason = "Analysis engine unavailable. Blocked under restrictive fallback policy.";
            } else if (fallbackAction === "redact") {
                finalAction = "redact";
                reason = "Potential sensitive data detected, but local analysis was unavailable. Contextual verification did not complete. Redacted under fallback policy.";
            } else if (fallbackAction === "audit" || fallbackAction === "audit_only") {
                finalAction = "audit";
                reason = "Potential sensitive data detected, but local analysis was unavailable. Prompt allowed for audit only under fallback policy.";
            } else {
                // Default: warn (degraded status)
                finalAction = "warn";
                reason = "Potential sensitive data detected, but local analysis was unavailable. Prompt allowed under degraded fallback policy. This was not based on full contextual analysis.";
            }

            const fallback = buildFallbackResult(analysisError.message);
            const fallbackDecision = {
                action: finalAction,
                reason,
                source: "backend_policy" as const,
                model_used: false,   // Ollama call failed
                policy_used: true,
                analysis_status: (analysisError.code === "TIMEOUT" ? "timeout" : 
                                 analysisError.code === "UNREACHABLE" ? "unavailable" : "error") as any,
                confidence_mode: "fallback" as const,
                degraded_mode_triggered: true,
            };

            return NextResponse.json(
                mapToLegacyResponse(fallback, fallbackDecision, aiTool, { analysisError }),
                { status: 200 },
            );
        }

        // ── Policy decision engine (dashboard config is the sole authority) ───────
        // Pass ollamaWasCalled=true so model_used is accurately tracked in the decision.
        console.log(`[Complyze] Ollama response received: risk_score=${analysisResult.overall_risk_score}, severity=${analysisResult.severity}`);
        const policyDecision = computePolicyDecision(analysisResult, orgPolicyConfig, hasCritical, aiTool, rules, true);

        // ── Persistent Activity Logging (Ensures Dashboard/Extension Sync) ────────
        // workspaceId must match what the dashboard queries — prefer orgId over "default".
        const resolvedWorkspaceId = workspaceId !== "default" ? workspaceId : (orgId || "default");

        const eventId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const activityEvent: ActivityEvent = {
            id: eventId,
            tool: aiTool,
            tool_domain: aiTool.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
            user_hash: userEmail || "anonymous",
            prompt_hash: "analyzed",
            prompt_length: promptText.length,
            token_count_estimate: Math.round(promptText.length / 4),
            api_endpoint: "browser_extension",
            sensitivity_score: analysisResult.overall_risk_score,
            sensitivity_categories: (analysisResult.sensitive_categories || []) as any,
            policy_violation_flag: policyDecision.action === "block",
            risk_category: analysisResult.severity,
            timestamp: new Date().toISOString(),
            enforcement_action: policyDecision.action === "allow" ? "monitor" : policyDecision.action,
            blocked: policyDecision.action === "block",
            findings: analysisResult.findings.map(f => f.reason),
            full_prompt: promptText,

            // Decision attribution fields — single source of truth for UI + dashboard
            decision_source: policyDecision.source,
            model_used: policyDecision.model_used,   // true = Ollama was consulted
            policy_used: policyDecision.policy_used,  // true = org policy was applied
            blocked_locally: false,                   // backend decision only
            analysis_score: analysisResult.overall_risk_score,
            contextual_risks: analysisResult.contextual_risks,
            prompt_preview: analysisResult.prompt_summary,
            provider: aiTool,

            // Identity fields — needed for dashboard ↔ extension sync.
            // organization_id + user_id ensure the dashboard shows the event
            // for the correct user/org without relying solely on workspace path.
            organization_id: orgId || resolvedWorkspaceId,
            user_id: userEmail || body.user_id || "anonymous",
            final_action: policyDecision.action,
        };

        try {
            await store.addEvent(activityEvent, resolvedWorkspaceId);
            console.log(`[scanPrompt] Activity logged: ${eventId} → workspace: ${resolvedWorkspaceId}`);
        } catch (e) {
            console.error("[scanPrompt] Failed to log activity to store", e);
        }

        console.log(
            `[Complyze] Policy decision applied: action=${policyDecision.action} | ` +
            `reason=${policyDecision.reason} | riskScore=${analysisResult.overall_risk_score} | tool=${aiTool}`,
        );

        return NextResponse.json(mapToLegacyResponse(analysisResult, policyDecision, aiTool, {}));
    } catch (err) {
        console.error("[scanPrompt] Unexpected error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map the rich ComplyzeAnalysisResult to the legacy response shape expected by
// the existing dashboard, extension, and proxy consumers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the highest-priority enabled policy rule targeting a specific AI tool
 */
function findToolPolicyRule(aiTool: string, rules: any[]): any | null {
    if (!Array.isArray(rules)) return null;
    // Tool rules look like: { type: "ai_tool", target: "tool:google_ai_studio", action: "block", priority: 10, enabled: true }
    // Map common display names to ToolIds for matching
    const toolIdMap: Record<string, string> = {
        "ChatGPT": "tool:chatgpt",
        "Claude": "tool:claude",
        "Gemini": "tool:gemini",
        "Google AI Studio": "tool:google_ai_studio",
        "Perplexity": "tool:perplexity",
        "Copilot": "tool:copilot",
        "Copilot (Microsoft)": "tool:copilot",
        "Grok": "tool:grok",
        "Mistral AI": "tool:mistral",
        "Cohere": "tool:cohere",
        "Midjourney": "tool:midjourney",
        "Stable Diffusion": "tool:stablediffusion",
        "GitHub Copilot": "tool:github_copilot",
        "Cursor": "tool:cursor",
        "Codeium": "tool:codeium",
        "Tabnine": "tool:tabnine",
        "OpenRouter": "tool:openrouter",
    };
    const targetId = toolIdMap[aiTool];
    if (!targetId) {
        console.log(`[policy] Tool '${aiTool}' not in registry — no tool-specific rules will match`);
        return null;
    }

    const matchingRules = rules
        .filter(r => r.enabled !== false && r.type === "ai_tool" && r.target === targetId)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (matchingRules.length > 0) {
        console.log(`[policy] Found ${matchingRules.length} enabled rule(s) for ${aiTool} (${targetId}) — using priority=${matchingRules[0].priority}`);
        return matchingRules[0];
    }
    return null;
}

/**
 * computePolicyDecision
 *
 * The logged-in user's org/admin policy config is the SOLE source of truth.
 * hasCriticalDlpMatch is always passed as false — regex MUST NOT drive decisions.
 * All risk signals come exclusively from the Ollama LLM analysis result.
 *
 * Decision path:
 *   0. Tool-specific rule override (if configured) — e.g., "Block all Google AI Studio"
 *   1. Audit mode   → always allow (observation only)
 *   2. AI risk score / severity → block if score ≥ threshold AND block_high_risk=true
 *   3. Attachment risk → block/warn per policy
 *   4. Auto-redaction → redact if sensitive categories detected AND policy enables it
 *   5. AI suggested action → advisory fallback (never overrides policy off switch)
 *
 * @param aiTool - Name of the AI tool (e.g., "Google AI Studio", "OpenRouter")
 * @param rules - Full policy rules array (includes tool-specific rules)
 * @param ollamaWasCalled - Whether Ollama was successfully invoked for this request
 */
function computePolicyDecision(
    analysis: ComplyzeAnalysisResult,
    policyConfig: any,
    hasCriticalDlpMatch: boolean,
    aiTool: string,
    rules: any[],
    ollamaWasCalled: boolean = true
): { action: "allow" | "redact" | "warn" | "block" | "audit"; reason: string; source: "backend_policy"; model_used: boolean; policy_used: boolean } {
    const threshold = policyConfig?.risk_threshold ?? 60;
    const blockHighRisk = policyConfig?.block_high_risk ?? true;
    const auditMode = policyConfig?.audit_mode === true;

    const result = {
        action: "allow" as "allow" | "redact" | "warn" | "block" | "audit",
        reason: "Prompt complies with organization policies.",
        source: "backend_policy" as const,
        model_used: ollamaWasCalled,
        policy_used: true,
    };

    // ── 0. Tool-specific policy rule override (highest priority) ─────────────
    // If admin has set a rule targeting this specific AI tool, use it immediately.
    // Example: "Block all Google AI Studio prompts" — overrides risk scoring.
    const toolRule = findToolPolicyRule(aiTool, rules);
    if (toolRule && toolRule.enabled !== false) {
        result.action = toolRule.action || "allow";
        result.reason = `Tool-specific policy rule applied: ${aiTool} → ${toolRule.action}`;
        console.log(`[policy] Tool rule match: ${aiTool} → ${toolRule.action} (priority=${toolRule.priority})`);
        return result;
    }

    // ── 1. Audit mode overrides all enforcement to allow (audit) ────────────
    if (auditMode) {
        result.action = "audit";
        result.reason = "Audit mode is enabled. Prompts are monitored only.";
        return result;
    }

    // ── 2. Explicit LLM Suggested Action (Priority) ──────────────────────────
    // If the LLM picked up on a specific Policy Rule we passed in (Tool, Category, etc.)
    // and suggested an action, we follow it exactly.
    if (analysis.suggested_action && analysis.suggested_action !== "allow") {
        const action = analysis.suggested_action;
        if (action === "block" || action === "warn" || action === "allow_with_redaction") {
            result.action = action === "allow_with_redaction" ? "redact" : action;
            result.reason = `Policy rule match: ${analysis.prompt_summary}`;
            console.log(`[policy] LLM suggested ${action} based on rules → ${result.action}`);
            return result;
        }
    }

    // ── 3. AI Risk Score / Severity Threshold (Global/Generic Fallback) ──────
    if (blockHighRisk) {
        if (analysis.overall_risk_score >= threshold) {
            result.action = "block";
            result.reason = `AI risk score (${analysis.overall_risk_score}) exceeds org threshold (${threshold}).`;
            return result;
        }
        if (analysis.severity === "critical" || analysis.severity === "high") {
            result.action = "block";
            result.reason = `AI severity (${analysis.severity}) exceeds acceptable risk tolerance.`;
            return result;
        }
    }

    // ── 5. Auto-redaction fallback ──────────────────────────────────────────
    if (policyConfig?.auto_redaction !== false && (analysis.sensitive_categories?.length || 0) > 0) {
        result.action = "redact";
        result.reason = "Sensitive data detected. Enforcing auto-redaction.";
        return result;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map the rich ComplyzeAnalysisResult to the legacy response shape expected by
// the existing dashboard, extension, and proxy consumers.
// ─────────────────────────────────────────────────────────────────────────────

function mapToLegacyResponse(
    result: ComplyzeAnalysisResult & { _error?: string },
    decision: { action: "allow" | "redact" | "warn" | "block" | "audit"; reason: string; source: string; model_used: boolean; policy_used: boolean },
    aiTool: string,
    extras: { analysisError?: OllamaAnalysisError | null },
) {
    const riskCategory =
        result.overall_risk_score > 75
            ? "critical"
            : result.overall_risk_score > 50
                ? "high"
                : result.overall_risk_score > 25
                    ? "medium"
                    : "low";

    const ollamaHostUsed = (process.env.OLLAMA_BASE_URL || "").trim().replace(/\/$/, "") || null;
    const ollamaModelUsed = (process.env.OLLAMA_MODEL || "").trim() || null;

    return {
        riskScore: result.overall_risk_score,
        action: decision.action,
        message: decision.reason,
        redactedText: result.redacted_prompt,
        categories: result.sensitive_categories,
        riskCategory,
        policyViolation: decision.action === "block",
        details: result.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.evidence || f.reason}`),
        aiTool,
        policy_decision: decision,
        analysis_result: {
            analysis_version: result.analysis_version,
            prompt_summary: result.prompt_summary,
            redacted_prompt: result.redacted_prompt,
            overall_risk_score: result.overall_risk_score,
            severity: result.severity,
            confidence: result.confidence,
            sensitive_categories: result.sensitive_categories,
            contextual_risks: result.contextual_risks,
            findings: result.findings,
            attachment_analysis: result.attachment_analysis,
            suggested_action: result.suggested_action,
            dashboard_metrics: result.dashboard_metrics,
            graph_data: result.graph_data,
        },
        decision_source: decision.source,
        model_used: decision.model_used,
        policy_used: decision.policy_used,
        blocked_locally: false,
        ollama_host_used: ollamaHostUsed,
        ollama_model_used: ollamaModelUsed,
        ...(result._error ? { analysisError: result._error } : {}),
        ...(extras.analysisError ? { analysisErrorCode: extras.analysisError.code } : {}),
    };
}
