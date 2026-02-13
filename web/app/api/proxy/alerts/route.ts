/**
 * /api/proxy/alerts — GET & POST
 * Manage proxy alerts.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET() {
    const alerts = await store.getAlerts(50);
    const unacknowledged = await store.getUnacknowledgedCount();
    return NextResponse.json({ alerts, unacknowledged_count: unacknowledged });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { alert_id, action } = body;

        if (action === "acknowledge" && alert_id) {
            await store.acknowledgeAlert(alert_id);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to process alert action";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
