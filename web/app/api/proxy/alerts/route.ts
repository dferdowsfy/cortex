/**
 * /api/proxy/alerts — GET & POST
 * Manage proxy alerts.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";
    const alerts = await store.getAlerts(workspaceId, 50);
    const unacknowledged = await store.getUnacknowledgedCount(workspaceId);
    return NextResponse.json({ alerts, unacknowledged_count: unacknowledged });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { alert_id, action, workspaceId } = body;

        if (action === "acknowledge" && alert_id) {
            await store.acknowledgeAlert(alert_id, workspaceId || "default");
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to process alert action";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
