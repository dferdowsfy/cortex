import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";
import type { ActivityEvent } from "@/lib/proxy-types";

export const dynamic = "force-dynamic";

/**
 * POST /api/activity
 * Ingests telemetry data from the browser extension.
 * Expected payload: { aiTool, promptLength, riskScore, action, userEmail?, workspaceId? }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { aiTool, promptLength, riskScore, action, userEmail, workspaceId, installationId } = body;

        if (!aiTool) {
            return NextResponse.json({ error: "aiTool is required" }, { status: 400 });
        }

        const orgId = req.headers.get("X-Organization-ID") || "default";
        const resolvedWorkspaceId = workspaceId || orgId;

        // Map extension payload to ActivityEvent schema
        const isBlocked = action === "blocked" || action === "block" || body.blocked === true;
        const score = parseInt(riskScore) || 0;

        const event: ActivityEvent = {
            id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tool: aiTool,
            tool_domain: aiTool.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com", // Best effort mapping
            user_hash: userEmail && userEmail !== "unknown@domain.com" ? userEmail : (installationId || "anonymous"),
            prompt_hash: "hidden_by_extension",
            prompt_length: parseInt(promptLength) || 0,
            token_count_estimate: Math.round((parseInt(promptLength) || 0) / 4),
            api_endpoint: "browser_extension",
            sensitivity_score: score,
            sensitivity_categories: (score > 0) ? ["dlp_match" as any] : ["none"],
            policy_violation_flag: isBlocked || score > 75,
            risk_category: score > 75 ? "critical" : (score > 50 ? "high" : "low"),
            timestamp: new Date().toISOString(),
            enforcement_action: isBlocked ? "block" : "monitor",
            blocked: isBlocked,
            findings: body.findings || (body.message ? [body.message] : []),
            full_prompt: body.promptText || body.prompt,

            // Map rich metadata if provided by extension (e.g. local emergency block)
            decision_source: body.decision_source || (isBlocked ? "backend_policy" : "manual_bypass"),
            model_used: body.model_used ?? !body.blocked_locally,
            policy_used: body.policy_used ?? true,
            blocked_locally: body.blocked_locally ?? false,
            analysis_score: score,
            contextual_risks: body.contextual_risks || [],
            prompt_preview: body.prompt_preview || body.message || "",
            provider: aiTool
        };

        await store.addEvent(event, resolvedWorkspaceId);

        return NextResponse.json({ status: "logged", event_id: event.id });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
