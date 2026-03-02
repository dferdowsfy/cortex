import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/user-store";

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

/** POST /api/admin/users — create or bulk import */
export async function POST(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const body = await req.json();

        // Bulk import: { org_id, emails: string[], group_id }
        if (Array.isArray(body.emails)) {
            const users = await userStore.bulkImport(body.org_id, body.emails, body.group_id || null, workspaceId);
            return NextResponse.json({ users }, { status: 201 });
        }

        // Single user create
        const { org_id, email, role, group_id, display_name } = body;
        if (!org_id || !email) return NextResponse.json({ error: "org_id and email are required" }, { status: 400 });
        const user = await userStore.createUser(org_id, email, role || "member", group_id || null, display_name, workspaceId);
        return NextResponse.json({ user }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** PATCH /api/admin/users — update user (role, group, active) */
export async function PATCH(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { user_id, ...updates } = await req.json();
        if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
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
