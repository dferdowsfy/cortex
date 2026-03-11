import { NextRequest, NextResponse } from "next/server";
import { policyScopeStore, type PolicyRule } from "@/lib/policy-scope-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") || "default";
    const { org_id } = await params;

    const policy = await policyScopeStore.getPolicy("org", org_id, workspaceId);
    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ org_id: string }> }) {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") || "default";
    const { org_id } = await params;
    const { rules } = await req.json();

    const policy = await policyScopeStore.upsertPolicy("org", org_id, org_id, rules as PolicyRule[], workspaceId);
    return NextResponse.json({ policy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
