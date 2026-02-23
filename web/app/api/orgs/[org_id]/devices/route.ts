import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * GET all devices enrolled under an organization.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        const devices = await enrollmentStore.listDevices(org_id, workspaceId);
        console.log(`[Device Fetch] Returning ${devices.length} devices for org_id ${org_id}`);
        return NextResponse.json({ devices });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
