import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/organizations
 * Lists organizations for a workspace. Auto-creates a default org if none exist.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId") || "default";

        let orgs = await enrollmentStore.listOrganizations(workspaceId);

        // Auto-bootstrap a default org so the admin panel is never empty
        if (orgs.length === 0) {
            const defaultOrg = await enrollmentStore.createOrganization("My Organization", workspaceId);
            orgs = [defaultOrg];
        }

        const organizations = orgs.map(org => ({
            id: org.org_id,
            name: org.name,
            created_at: org.created_at,
            policy_version: org.policy_version,
        }));

        return NextResponse.json({ organizations });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/admin/organizations
 * Creates a new organization.
 */
export async function POST(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId") || "default";
        const body = await req.json();
        const { name } = body;

        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "name is required" }, { status: 400 });
        }

        const org = await enrollmentStore.createOrganization(name.trim(), workspaceId);

        return NextResponse.json({
            id: org.org_id,
            name: org.name,
            created_at: org.created_at,
            policy_version: org.policy_version,
        }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
