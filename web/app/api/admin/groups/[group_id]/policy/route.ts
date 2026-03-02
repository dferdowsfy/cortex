import { NextRequest, NextResponse } from "next/server";
import { groupStore, PolicyRule } from "@/lib/group-store";

export const dynamic = "force-dynamic";

/** GET /api/admin/groups/[group_id]/policy */
export async function GET(req: NextRequest, { params }: { params: Promise<{ group_id: string }> }) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { group_id } = await params;
        const policy = await groupStore.getPolicyByGroup(group_id, workspaceId);
        return NextResponse.json({ policy });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/** POST /api/admin/groups/[group_id]/policy — upsert policy */
export async function POST(req: NextRequest, { params }: { params: Promise<{ group_id: string }> }) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";
        const { group_id } = await params;
        const { org_id, rules, inherit_org_default } = await req.json();
        if (!org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

        const policy = await groupStore.createOrUpdatePolicy(
            group_id,
            org_id,
            rules as PolicyRule[],
            inherit_org_default ?? true,
            workspaceId
        );
        return NextResponse.json({ policy });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
