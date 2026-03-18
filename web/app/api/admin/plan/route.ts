import { NextRequest, NextResponse } from "next/server";
import { enrollmentStore } from "@/lib/enrollment-store";
import { getPlan } from "@/lib/saas-types";
import { getIdentity } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/plan?org_id=&workspaceId=
 * 
 * Returns plan entitlements and current usage for an organization.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const orgId = searchParams.get("org_id");
        const workspaceId = searchParams.get("workspaceId") || "default";

        if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

        // Permission check: Any member of the org can see the plan info? 
        // Usually, yes, or at least any admin. Let's use getIdentity.
        const identity = await getIdentity(workspaceId);
        if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!identity.isSuperAdmin && identity.org_id !== orgId) {
            return NextResponse.json({ error: "Access Denied" }, { status: 403 });
        }

        const org = await enrollmentStore.getOrganization(orgId, workspaceId);
        if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

        const plan = getPlan(org.plan?.toLowerCase());

        return NextResponse.json({
            plan: {
                id: plan.id,
                name: plan.name,
                entitlements: plan,
                usage: {
                    seats_used: org.seatsUsed || 0,
                    seats_total: plan.max_users,
                    groups_used: org.groupsCount || 0,
                    groups_total: plan.max_groups,
                }
            }
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
