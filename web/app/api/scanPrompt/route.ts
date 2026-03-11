import { NextRequest, NextResponse } from "next/server";
import { groupStore } from "@/lib/group-store";
import { enrollmentStore } from "@/lib/enrollment-store";
import { userStore } from "@/lib/user-store";
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
 * local `complyze-qwen` Ollama model.
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
        const workspaceId: string = body.workspaceId || "default";
        const context: string | string[] = body.context || "";

        const orgId: string | null = req.headers.get("X-Organization-ID") || body.orgId || null;
        const authHeader: string | null = req.headers.get("Authorization");
        const userEmail: string | null = req.headers.get("X-User-Email") || body.userEmail || null;

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
            const org = await enrollmentStore.getOrganization(orgId, workspaceId);
            if (org?.policy_config) {
                orgPolicyConfig = org.policy_config;
                if (org.policy_config.rules) {
                    rules = org.policy_config.rules;
                }
            }

            if (userEmail && userEmail !== "unknown@domain.com") {
                try {
                    const users = await userStore.listUsers(orgId, workspaceId);
                    const foundUser = users.find((u) => u.email === userEmail);
                    if (foundUser?.group_id) {
                        const groupPolicy = await groupStore.getPolicyByGroup(foundUser.group_id, workspaceId);
                        const groupRules = groupPolicy?.rules || [];
                        if (groupRules.length > 0) {
                            rules = groupPolicy?.inherit_org_default ? [...rules, ...groupRules] : groupRules;
                        }
                    }
                } catch (e) {
                    console.error("[scanPrompt] Could not fetch user group", e);
                }
            }
        }

        // ── Build context string ───────────────────────────────────────────────────
        const contextStr = Array.isArray(context) ? context.join("\n---\n") : context;

        // ── Server-side DLP safety net (runs before LLM, not after) ───────────────
        const criticalPatterns = [
            /\b(AKIA|AGPA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,20}\b/,
            /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/,
            /\b(?!000|666|9\d{2})\d{3}-\d{2}-\d{4}\b/,
        ];
        const hasCritical = criticalPatterns.some((p) => p.test(promptText));
        if (hasCritical) console.log("[scanPrompt] Critical DLP pattern matched locally.");

        // ── Call Ollama analysis ───────────────────────────────────────────────────
        console.log(`[scanPrompt] Dispatching to Ollama: ${aiTool} (prompt size: ${promptText.length})`);
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
            // Return a graceful fallback so the dashboard still renders
            const fallback = buildFallbackResult(analysisError.message);
            const fallbackDecision = {
                action: "warn" as const,
                reason: "Analysis engine failed. Allowed with warning.",
                source: "backend_policy" as const,
                model_used: false,
                policy_used: true
            };
            return NextResponse.json(
                mapToLegacyResponse(fallback, fallbackDecision, aiTool, { analysisError }),
                { status: 200 },
            );
        }

        // ── Policy decision engine (dashboard config is the sole authority) ───────
        const policyDecision = computePolicyDecision(analysisResult, orgPolicyConfig, hasCritical);

        // ── Persistent Activity Logging (Ensures Dashboard/Extension Sync) ────────
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

            // New metadata fields
            decision_source: policyDecision.source,
            model_used: policyDecision.model_used,
            policy_used: policyDecision.policy_used,
            blocked_locally: false,
            analysis_score: analysisResult.overall_risk_score,
            contextual_risks: analysisResult.contextual_risks,
            prompt_preview: analysisResult.prompt_summary,
            provider: aiTool
        };

        try {
            await store.addEvent(activityEvent, workspaceId || orgId || "default");
            console.log(`[scanPrompt] Activity logged: ${eventId}`);
        } catch (e) {
            console.error("[scanPrompt] Failed to log activity to store", e);
        }

        console.log(
            `[scanPrompt] Final: action=${policyDecision.action} | ` +
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

function computePolicyDecision(
    analysis: ComplyzeAnalysisResult,
    policyConfig: any,
    hasCriticalDlpMatch: boolean
): { action: "allow" | "redact" | "warn" | "block"; reason: string; source: "backend_policy"; model_used: boolean; policy_used: boolean } {
    const threshold = policyConfig?.risk_threshold ?? 60;
    const blockHighRisk = policyConfig?.block_high_risk ?? true;
    const auditMode = policyConfig?.audit_mode === true;

    const result = {
        action: "allow" as "allow" | "redact" | "warn" | "block",
        reason: "Prompt complies with organization policies.",
        source: "backend_policy" as const,
        model_used: true,
        policy_used: true
    };

    // 1. Audit mode overrides everything to allow
    if (auditMode) {
        result.action = "allow";
        result.reason = "Audit mode is enabled. Allowing prompt.";
        return result;
    }

    // 2. Hard deterministic DLP override (Injected from patterns or server check)
    if (hasCriticalDlpMatch) {
        result.action = "block";
        result.reason = "Critical regex match (API Key, SSN). Automatic block.";
        result.model_used = false; // Decided by regex before/alongside model
        return result;
    }

    // 3. Block high risk score if enabled
    if (blockHighRisk) {
        if (analysis.overall_risk_score >= threshold) {
            result.action = "block";
            result.reason = `Risk score (${analysis.overall_risk_score}) exceeds organization threshold (${threshold}).`;
            return result;
        }
        if (analysis.severity === "critical" || analysis.severity === "high") {
            result.action = "block";
            result.reason = `AI severity (${analysis.severity}) exceeds acceptable risk tolerance.`;
            return result;
        }
    }

    // 4. Attachment risk block
    if (policyConfig?.scan_attachments !== false && analysis.attachment_analysis?.attachment_present) {
        if (analysis.attachment_analysis.attachment_risk_score >= threshold) {
            result.action = blockHighRisk ? "block" : "warn";
            result.reason = "Attachment risk score exceeds organization threshold.";
            return result;
        }
    }

    // 5. Automatic Redaction if configured
    if (policyConfig?.auto_redaction !== false) {
        if (analysis.sensitive_categories?.length > 0 || analysis.redacted_prompt !== analysis.prompt_summary) {
            result.action = "redact";
            result.reason = "Sensitive categories detected. Enforcing auto-redaction.";
            return result;
        }
    }

    // 6. Final fallback: If AI strongly suggested a block or manual review, but org didn't enforce block above
    if (analysis.suggested_action === "block" && blockHighRisk) {
        result.action = "block";
        result.reason = "AI analyst explicitly suggested blocking.";
        return result;
    }
    if (analysis.suggested_action === "warn" || analysis.suggested_action === "manual_review") {
        result.action = "warn";
        result.reason = "AI analyst suggested warning or review.";
        return result;
    }

    return result;
}

function mapToLegacyResponse(
    result: ComplyzeAnalysisResult & { _error?: string },
    decision: { action: "allow" | "redact" | "warn" | "block"; reason: string; source: string; model_used: boolean; policy_used: boolean },
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

    return {
        // Legacy fields mapping for proxy compatibility
        riskScore: result.overall_risk_score,
        action: decision.action,
        message: decision.reason,
        redactedText: result.redacted_prompt,
        categories: result.sensitive_categories,
        riskCategory,
        policyViolation: decision.action === "block",
        details: result.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.evidence || f.reason}`),
        aiTool,

        // New strictly cleanly separated fields
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

        // Debug & Path Tracking
        decision_source: decision.source,
        model_used: decision.model_used,
        policy_used: decision.policy_used,
        blocked_locally: false,

        // Surface errors if any
        ...(result._error ? { analysisError: result._error } : {}),
        ...(extras.analysisError ? { analysisErrorCode: extras.analysisError.code } : {}),
    };
}
