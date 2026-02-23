import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * Revokes an enrolled device.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const body = await req.json();
        const { device_id } = body;
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        if (!device_id) {
            return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
        }

        // Validate device belongs to org
        const device = await enrollmentStore.getDevice(device_id, workspaceId);
        if (!device || device.org_id !== org_id) {
            return NextResponse.json({ error: "Device not found or invalid org" }, { status: 404 });
        }

        await enrollmentStore.revokeDevice(device_id, workspaceId);

        return NextResponse.json({
            status: "ok",
            message: "Device revoked"
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
