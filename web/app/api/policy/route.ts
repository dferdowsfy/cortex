import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { localStorage } from "@/lib/local-storage";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/policy
 * Returns signed policy payload for a verified device.
 */
export async function GET(req: NextRequest) {
    try {
        const device_id = req.headers.get("device_id");
        const timestamp = req.headers.get("timestamp");
        const signature = req.headers.get("signature");

        if (!device_id || !timestamp || !signature) {
            return NextResponse.json({ error: "device_id, timestamp, and signature headers are required" }, { status: 400 });
        }

        const now = Date.now();
        const timeDiff = Math.abs(now - parseInt(timestamp));
        if (Number.isNaN(timeDiff) || timeDiff > 5 * 60 * 1000) {
            return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
        }

        // Validate device
        const workspaceId = localStorage.findWorkspaceForDevice(device_id) || "default";
        const device = await enrollmentStore.getDevice(device_id, workspaceId);
        if (!device) {
            return NextResponse.json({ error: "Device not found or not enrolled" }, { status: 404 });
        }

        // Verify cryptographic signature 
        // Note: Mathematical HMAC computation uses the stored mapped hash array as its dynamic key on the backend
        const expectedSignature = crypto.createHmac('sha256', device.device_secret_hash)
            .update(device_id + timestamp)
            .digest('hex');

        if (signature !== expectedSignature) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        if (device.status === 'revoked') {
            return NextResponse.json({ error: "Device revoked" }, { status: 403 });
        }

        const org = await enrollmentStore.getOrganization(device.org_id, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        // Return signed policy payload
        const signedPolicy = enrollmentStore.signPolicy(org);

        // Required Sample Response format
        return NextResponse.json(signedPolicy);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
