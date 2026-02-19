/**
 * /api/proxy/intercept — POST
 * The proxy endpoint. Receives AI requests, classifies them,
 * logs activity events, applies policy (block/redact), and forwards to the AI provider.
 *
 * Latency target: < 250ms added overhead (classification is regex-based, not LLM-based).
 */
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import store from "@/lib/proxy-store";
import {
    classifyContent,
    estimateTokens,
    hashString,
    extractToolDomain,
    identifyTool,
    redactSensitiveContent,
} from "@/lib/proxy-classifier";
import type { ActivityEvent } from "@/lib/proxy-types";

export const maxDuration = 120;

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

        // ── 1. Capture metadata ──
        const domain = extractToolDomain(target_url);
        const tool = identifyTool(domain);
        const userHash = hashString(user_id || "anonymous");
        const promptHash = hashString(contentToClassify);
        const promptLength = contentToClassify.length;
        const tokenEstimate = estimateTokens(contentToClassify);

        // ── 2. Run lightweight classification ──
        const classification = classifyContent(contentToClassify);

        // ── 3. Generate structured activity event ──
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
            sensitivity_score: classification.sensitivity_score,
            sensitivity_categories: classification.categories_detected,
            policy_violation_flag: classification.policy_violation_flag,
            risk_category: classification.risk_category,
            timestamp: new Date().toISOString(),
            attachment_inspection_enabled: settings.inspect_attachments,
        };

        // ── 4. Store full prompt only in Full Audit Mode ──
        if (settings.full_audit_mode) {
            event.full_prompt = contentToClassify;
        }

        // ── 4.1 Check and mark blocked status ──
        if (settings.block_high_risk && classification.risk_category === "critical") {
            event.blocked = true;
        }

        // Log the event
        await store.addEvent(event, workspaceId);

        const processingTime = Date.now() - startTime;

        // ── 5. Log-only mode: return immediately (used by proxy server) ──
        if (log_only) {
            return NextResponse.json({
                logged: true,
                event_id: event.id,
                tool,
                sensitivity_score: classification.sensitivity_score,
                risk_category: classification.risk_category,
                categories: classification.categories_detected,
                processing_time_ms: processingTime,
            });
        }

        // ── 6. Policy enforcement (forward mode) ──
        if (settings.block_high_risk && classification.risk_category === "critical") {
            return NextResponse.json({
                blocked: true,
                reason: "Prompt blocked by policy: critical sensitivity level detected",
                classification: {
                    sensitivity_score: classification.sensitivity_score,
                    categories: classification.categories_detected,
                    details: classification.details,
                },
                event_id: event.id,
                processing_time_ms: processingTime,
            });
        }

        // ── 7. Prepare forwarded body ──
        let forwardBody = contentToClassify;
        if (settings.redact_sensitive && classification.policy_violation_flag) {
            forwardBody = redactSensitiveContent(contentToClassify);
        }

        // ── 8. Forward to original AI provider ──
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

        // ── 9. Return response to user with metadata ──
        return new NextResponse(aiData, {
            status: aiResponse.status,
            headers: {
                "Content-Type": aiResponse.headers.get("Content-Type") || "application/json",
                "X-Complyze-Event-Id": event.id,
                "X-Complyze-Sensitivity": classification.sensitivity_score.toString(),
                "X-Complyze-Processing-Ms": (Date.now() - startTime).toString(),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Proxy error";
        console.error("[/api/proxy/intercept]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
