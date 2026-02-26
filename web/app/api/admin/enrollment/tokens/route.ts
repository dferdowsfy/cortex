import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/enrollment/tokens?organizationId=&workspaceId=
 * Lists tokens for an organization (never exposes raw token values).
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId") || "default";
        const organizationId = searchParams.get("organizationId") || "";

        const raw = await enrollmentStore.listTokens(organizationId, workspaceId);
        const now = new Date();

        const tokens = raw.map(t => ({
            id: t.token_id,
            // Show only the token_id prefix — raw token is one-time-display only
            token: `${t.token_id.substring(0, 8)}…`,
            status: t.revoked ? "revoked" : new Date(t.expires_at) < now ? "expired" : "active",
            created_at: t.created_at,
            expires_at: t.expires_at,
            uses_count: t.uses_count,
            max_uses: t.max_uses,
            org_id: t.org_id,
        }));

        return NextResponse.json({ tokens });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/enrollment/tokens
 * Generates a new enrollment token.
 * Returns plain_token ONCE — must be copied by admin immediately.
 */
export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId") || "default";
        const body = await req.json();
        const {
            organizationId,
            expires_in_hours = 168, // 7 days default
            max_uses = null,
        } = body;

        if (!organizationId) {
            return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
        }

        const org = await enrollmentStore.getOrganization(organizationId, workspaceId);
        if (!org) {
            return NextResponse.json({ error: "Organization not found" }, { status: 404 });
        }

        const token = await enrollmentStore.createToken(organizationId, expires_in_hours, max_uses, workspaceId);

        return NextResponse.json({
            id: token.token_id,
            plain_token: token.plain_token, // Returned ONCE — store securely
            status: "active",
            created_at: token.created_at,
            expires_at: token.expires_at,
            max_uses: token.max_uses,
            uses_count: 0,
            org_id: organizationId,
        }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
