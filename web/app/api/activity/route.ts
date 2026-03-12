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
        const userUid = req.headers.get("X-User-UID") || body.user_id || body.uid || null;

        if (!aiTool) {
            return NextResponse.json({ error: "aiTool is required" }, { status: 400 });
        }

        const orgId = req.headers.get("X-Organization-ID") || body.orgId || body.organization_id || "default";
        const resolvedWorkspaceId = orgId || workspaceId || "default";

        console.log("[/api/activity] ingest", {
            aiTool,
            action,
            score: riskScore,
            workspaceId: resolvedWorkspaceId,
            orgId,
            userEmail: userEmail || "unknown",
            userUid: userUid || "unknown",
        });

        // Map extension payload to ActivityEvent schema
        const isBlocked = action === "blocked" || action === "block" || body.blocked === true;
        const score = parseInt(riskScore) || 0;

        const event: ActivityEvent = {
            id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tool: aiTool,
            tool_domain: aiTool.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com", // Best effort mapping
            user_hash: userEmail && userEmail !== "unknown@domain.com" ? userEmail : (userUid || installationId || "anonymous"),
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

            // Map rich metadata if provided by extension (e.g. local emergency block).
            // For emergency local blocks: decision_source='local_emergency_block', blocked_locally=true.
            // For normal activity logs: fall back to 'manual_bypass' (not 'backend_policy') since
            // the backend policy engine was NOT consulted if /api/activity is called directly.
            decision_source: body.decision_source || (isBlocked ? "local_emergency_block" : "manual_bypass"),
            model_used: body.model_used ?? false,  // /api/activity is called for offline/local events only
            policy_used: body.policy_used ?? false,
            blocked_locally: body.blocked_locally ?? isBlocked,
            analysis_score: score,
            contextual_risks: body.contextual_risks || [],
            prompt_preview: body.prompt_preview || body.message || "",
            provider: aiTool,

            // Identity fields — ensure dashboard correctly attributes this event
            // to the right user/org regardless of workspace path used.
            organization_id: orgId || resolvedWorkspaceId,
            user_id: userUid || userEmail || installationId || "anonymous",
            final_action: isBlocked ? "block" : (action || "allow"),
        };

        await store.addEvent(event, resolvedWorkspaceId);
        console.log(`[/api/activity] stored event ${event.id} in workspace ${resolvedWorkspaceId} for user ${event.user_id}`);

        return NextResponse.json({ status: "logged", event_id: event.id });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
