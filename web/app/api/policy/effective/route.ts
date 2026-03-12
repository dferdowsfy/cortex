import { NextRequest, NextResponse } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";
import { resolveEffectivePolicy } from "@/lib/policy-resolver";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const effective = await resolveEffectivePolicy({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    email: ctx.email,
    workspaceId: "default",
  });

  console.log(JSON.stringify({
    msg: "policy_effective_resolved",
    requestId: ctx.requestId,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    policyVersion: effective.policyVersion,
  }));

  return NextResponse.json(effective);
}
