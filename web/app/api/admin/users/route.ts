import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/user-store";
import { enrollmentStore } from "@/lib/enrollment-store";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/users?org_id=&workspaceId= */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const org_id = url.searchParams.get("org_id") || "";
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        if (!org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
        const users = await userStore.listUsers(org_id, workspaceId);
        return NextResponse.json({ users });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

import { requireOrgAdmin } from "@/lib/auth-guards";
import { getPlan } from "@/lib/saas-types";

/** POST /api/admin/users — create or bulk import */
export async function POST(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const body = await req.json();
        const { org_id, email, role, group_id, display_name } = body;

        // 1. Permission Check
        await requireOrgAdmin(workspaceId, org_id);

        if (!org_id || !email) return NextResponse.json({ error: "org_id and email are required" }, { status: 400 });

        // 2. Seat Enforcement Logic
        const org = await enrollmentStore.getOrganization(org_id, workspaceId);
        if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

        const plan = getPlan(org.plan?.toLowerCase());
        const used = org.seatsUsed || 0;

        if (used >= plan.max_users) {
            return NextResponse.json({
                error: `User limit reached for current plan (${plan.name}). Max ${plan.max_users} users allowed.`
            }, { status: 403 });
        }

        // 3. Create User
        const user = await userStore.createUser(org_id, email, role || "member", group_id || null, display_name, workspaceId);

        // 4. Increment seatsUsed
        if (adminDb) {
            await adminDb.ref(`organizations/${org_id}/seatsUsed`).set(used + 1);
        }

        return NextResponse.json({ user }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: err.message.includes("Denied") ? 403 : 500 });
    }
}

/** PATCH /api/admin/users — update user (role, group, active) */
export async function PATCH(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { user_id, regenerate_license, ...updates } = await req.json();
        if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

        if (regenerate_license) {
            const newKey = await userStore.regenerateLicenseKey(user_id, workspaceId);
            return NextResponse.json({ license_key: newKey });
        }

        const user = await userStore.updateUser(user_id, updates, workspaceId);
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        return NextResponse.json({ user });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** DELETE /api/admin/users?user_id=&workspaceId= */
export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const user_id = url.searchParams.get("user_id") || "";
        if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
        await userStore.deleteUser(user_id, workspaceId);
        return NextResponse.json({ status: "ok" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
