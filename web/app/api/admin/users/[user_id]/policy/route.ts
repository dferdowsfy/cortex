import { NextRequest, NextResponse } from "next/server";
import { policyScopeStore, type PolicyRule } from "@/lib/policy-scope-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") || "default";
    const { user_id } = await params;

    const policy = await policyScopeStore.getPolicy("user", user_id, workspaceId);
    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ user_id: string }> }) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") || "default";
    const { user_id } = await params;
    const { org_id, rules } = await req.json();

    if (!org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

    const policy = await policyScopeStore.upsertPolicy("user", user_id, org_id, rules as PolicyRule[], workspaceId);
    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
