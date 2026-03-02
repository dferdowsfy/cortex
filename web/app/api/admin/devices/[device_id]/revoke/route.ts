import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/** POST /api/admin/devices/[device_id]/revoke */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ device_id: string }> }
) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || undefined;
        const { device_id } = await params;

        if (!device_id) {
            return NextResponse.json({ error: "device_id is required" }, { status: 400 });
        }

        const device = await enrollmentStore.getDevice(device_id, workspaceId);
        if (!device) {
            return NextResponse.json({ error: "Device not found" }, { status: 404 });
        }
        if (device.status === "revoked") {
            return NextResponse.json({ status: "already_revoked" });
        }

        await enrollmentStore.revokeDevice(device_id, workspaceId);

        return NextResponse.json({
            status: "revoked",
            device_id,
            revoked_at: new Date().toISOString(),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
