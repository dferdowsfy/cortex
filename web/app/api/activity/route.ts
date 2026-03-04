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

        const resolvedWorkspaceId = workspaceId || "default";

        // Map extension payload to ActivityEvent schema
        const event: ActivityEvent = {
            id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tool: aiTool,
            tool_domain: aiTool.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com", // Best effort mapping
            user_hash: userEmail && userEmail !== "unknown@domain.com" ? userEmail : (installationId || "anonymous"),
            prompt_hash: "hidden_by_extension",
            prompt_length: parseInt(promptLength) || 0,
            token_count_estimate: Math.round((parseInt(promptLength) || 0) / 4),
            api_endpoint: "browser_extension",
            sensitivity_score: parseInt(riskScore) || 0,
            sensitivity_categories: (parseInt(riskScore) > 0) ? ["dlp_match" as any] : ["none"],
            policy_violation_flag: action === "blocked",
            risk_category: parseInt(riskScore) > 75 ? "critical" : (parseInt(riskScore) > 50 ? "high" : "low"),
            timestamp: new Date().toISOString(),
            enforcement_action: action === "blocked" ? "block" : "monitor",
            blocked: action === "blocked"
        };

        await store.addEvent(event, resolvedWorkspaceId);

        return NextResponse.json({ status: "logged", event_id: event.id });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
