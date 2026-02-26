import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/enrollment/tokens/[tokenId]/revoke
 * Revokes an enrollment token so no new devices can enroll with it.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ tokenId: string }> }
) {
    try {
        const { tokenId } = await params;
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId") || "default";

        const token = await enrollmentStore.getTokenById(tokenId, workspaceId);
        if (!token) {
            return NextResponse.json({ error: "Token not found" }, { status: 404 });
        }

        if (token.revoked) {
            return NextResponse.json({ error: "Token already revoked" }, { status: 400 });
        }

        await enrollmentStore.revokeToken(tokenId, workspaceId);

        return NextResponse.json({ status: "ok", message: "Token revoked successfully" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
