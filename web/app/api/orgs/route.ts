import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

/**
 * Creates a new organization in the system.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name } = body;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        if (!name) {
            return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
        }

        const org = await enrollmentStore.createOrganization(name, workspaceId);

        return NextResponse.json({
            status: "ok",
            org_id: org.org_id,
            name: org.name,
            created_at: org.created_at,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * GET all organizations (for Admin UI testing).
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        const orgs = await enrollmentStore.listOrganizations(workspaceId);
        // Remove signing_secret from the UI payload
        const safeOrgs = orgs.map(org => {
            const { signing_secret, ...safeOrg } = org;
            return safeOrg;
        });
        return NextResponse.json({ orgs: safeOrgs });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
