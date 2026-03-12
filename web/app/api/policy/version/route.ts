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

  return NextResponse.json({
    userId: effective.userId,
    organizationId: effective.organizationId,
    policyVersion: effective.policyVersion,
    updatedAt: effective.updatedAt,
  });
}
