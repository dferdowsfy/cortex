import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { localStorage } from "@/lib/local-storage";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/enroll
 * Registers a new device using an enrollment token.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { enrollment_token, device_fingerprint, os_type, agent_version } = body;

        if (!enrollment_token || !os_type || !agent_version) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate token
        const token_id = enrollment_token.split('.')[0];
        const workspaceId = localStorage.findWorkspaceForToken(token_id) || "default";

        const tokenInfo = await enrollmentStore.getToken(enrollment_token, workspaceId);
        if (!tokenInfo) {
            return NextResponse.json({ error: "Invalid enrollment token" }, { status: 401 });
        }

        if (tokenInfo.revoked) {
            return NextResponse.json({ error: "Enrollment token revoked" }, { status: 401 });
        }

        const now = new Date();
        if (new Date(tokenInfo.expires_at) < now) {
            return NextResponse.json({ error: "Enrollment token expired" }, { status: 401 });
        }

        if (tokenInfo.max_uses !== null && tokenInfo.uses_count >= tokenInfo.max_uses) {
            return NextResponse.json({ error: "Enrollment token max uses reached" }, { status: 401 });
        }

        const org = await enrollmentStore.getOrganization(tokenInfo.org_id, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Invalid organization" }, { status: 401 });
        }

        // Increment usage
        await enrollmentStore.incrementTokenUsage(enrollment_token, workspaceId);

        // Create device record
        const device_id = device_fingerprint || crypto.randomUUID();
        const device_secret = crypto.randomBytes(32).toString('base64url');
        const device_secret_hash = crypto.createHash('sha256').update(device_secret).digest('hex');

        await enrollmentStore.createDevice(device_id, org.org_id, os_type, agent_version, device_secret_hash, undefined, workspaceId);

        // Generate signed policy payload
        const signedPolicy = enrollmentStore.signPolicy(org);

        // Required Sample Response format
        return NextResponse.json({
            device_id: device_id,
            device_secret: device_secret, // Return once
            policy: signedPolicy
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
