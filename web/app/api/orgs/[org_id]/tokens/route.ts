import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * Generate an enrollment token for an organization.
 * POST /api/orgs/[org_id]/tokens
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const body = await req.json();
        const { expires_in_hours, max_uses } = body;
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        const org = await enrollmentStore.getOrganization(org_id, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        const expiresIn = expires_in_hours || 24;
        const maxUses = max_uses !== undefined ? max_uses : null;

        const token = await enrollmentStore.createToken(org_id, expiresIn, maxUses, workspaceId);

        // Required Response Sample
        return NextResponse.json({
            status: "ok",
            token: token.plain_token, // token_value returned only once
            expires_at: token.expires_at,
            max_uses: token.max_uses,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * GET tokens for an org (for Admin UI testing).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
    try {
        const { org_id } = await params;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        const tokens = await enrollmentStore.listTokens(org_id, workspaceId);
        return NextResponse.json({ tokens });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
