import { NextRequest, NextResponse } from "next/server";
import { groupStore } from "@/lib/group-store";

export const dynamic = "force-dynamic";

/** GET /api/admin/groups?org_id=&workspaceId= */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const org_id = url.searchParams.get("org_id") || "";
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        if (!org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
        const groups = await groupStore.listGroups(org_id, workspaceId);
        return NextResponse.json({ groups });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** POST /api/admin/groups — create group */
export async function POST(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { org_id, name, description } = await req.json();
        if (!org_id || !name) return NextResponse.json({ error: "org_id and name are required" }, { status: 400 });
        const group = await groupStore.createGroup(org_id, name, description, workspaceId);
        return NextResponse.json({ group }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** PATCH /api/admin/groups — update group */
export async function PATCH(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { group_id, name, description } = await req.json();
        if (!group_id) return NextResponse.json({ error: "group_id is required" }, { status: 400 });
        const group = await groupStore.updateGroup(group_id, { name, description }, workspaceId);
        if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
        return NextResponse.json({ group });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** DELETE /api/admin/groups?group_id=&workspaceId= */
export async function DELETE(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const group_id = url.searchParams.get("group_id") || "";
        if (!group_id) return NextResponse.json({ error: "group_id is required" }, { status: 400 });
        await groupStore.deleteGroup(group_id, workspaceId);
        return NextResponse.json({ status: "ok" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
