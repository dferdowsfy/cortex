import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { localStorage } from "@/lib/local-storage";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/heartbeat
 * Updates the last_heartbeat timestamp and status of an enrolled device.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Grab device ID from header or body for backwards compatibility, but prefer header
        const req_device_id = req.headers.get("device_id") || body.device_id;
        const timestamp = req.headers.get("timestamp");
        const signature = req.headers.get("signature");

        const { status, agent_version } = body;

        if (!req_device_id || !timestamp || !signature) {
            return NextResponse.json({ error: "device_id, timestamp, and signature headers are required" }, { status: 400 });
        }

        const now = Date.now();
        const timeDiff = Math.abs(now - parseInt(timestamp));
        if (Number.isNaN(timeDiff) || timeDiff > 5 * 60 * 1000) {
            return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
        }

        const workspaceId = localStorage.findWorkspaceForDevice(req_device_id) || "default";
        const device = await enrollmentStore.getDevice(req_device_id, workspaceId);
        if (!device) {
            return NextResponse.json({ error: "Device not found" }, { status: 404 });
        }

        const expectedSignature = crypto.createHmac('sha256', device.device_secret_hash)
            .update(req_device_id + timestamp)
            .digest('hex');

        if (signature !== expectedSignature) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }


        // Default to active if status is missing
        const newStatus = status === 'revoked' ? 'revoked' : 'active';
        const newVersion = agent_version || device.agent_version;

        await enrollmentStore.updateHeartbeat(req_device_id, newStatus, newVersion, workspaceId);

        return NextResponse.json({
            status: "ok",
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
