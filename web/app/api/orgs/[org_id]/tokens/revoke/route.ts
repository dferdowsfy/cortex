import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * Revokes a specific token by its ID.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const body = await req.json();
        const { token_id } = body;
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        if (!token_id) {
            return NextResponse.json({ error: "Token ID is required" }, { status: 400 });
        }

        // Validate token belongs to org
        const tokenInfo = await enrollmentStore.getTokenById(token_id, workspaceId);
        if (!tokenInfo || tokenInfo.org_id !== org_id) {
            return NextResponse.json({ error: "Token not found or invalid org" }, { status: 404 });
        }

        await enrollmentStore.revokeToken(token_id, workspaceId);

        return NextResponse.json({
            status: "ok",
            message: "Token revoked"
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
