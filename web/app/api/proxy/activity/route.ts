/**
 * /api/proxy/activity — GET
 * Retrieve activity summary and recent events.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    // Prefer explicit ?workspaceId= param, then fall back to X-Organization-ID header
    // (set automatically by background.js buildHeaders()). This ensures the dashboard
    // always queries the correct workspace even when the param is omitted.
    const workspaceId =
        searchParams.get("workspaceId") ||
        req.headers.get("X-Organization-ID") ||
        "default";
    const period = (searchParams.get("period") as "7d" | "30d") || "7d";
    const eventsLimit = parseInt(searchParams.get("events") || "50", 10);

    const summary = await store.getSummary(workspaceId, period);
    const events = await store.getEvents(workspaceId, eventsLimit);
    const toolRisks = await store.getToolRisks(workspaceId);
    const alerts = await store.getAlerts(workspaceId, 20);
    const unacknowledgedAlerts = await store.getUnacknowledgedCount(workspaceId);

    return NextResponse.json({
        summary,
        events,
        tool_risks: toolRisks,
        alerts,
        unacknowledged_alerts: unacknowledgedAlerts,
    });
}
