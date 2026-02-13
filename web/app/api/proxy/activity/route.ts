/**
 * /api/proxy/activity — GET
 * Retrieve activity summary and recent events.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get("period") as "7d" | "30d") || "7d";
    const eventsLimit = parseInt(searchParams.get("events") || "50", 10);

    const summary = await store.getSummary(period);
    const events = await store.getEvents(eventsLimit);
    const toolRisks = await store.getToolRisks();
    const alerts = await store.getAlerts(20);
    const unacknowledgedAlerts = await store.getUnacknowledgedCount();

    return NextResponse.json({
        summary,
        events,
        tool_risks: toolRisks,
        alerts,
        unacknowledged_alerts: unacknowledgedAlerts,
    });
}
