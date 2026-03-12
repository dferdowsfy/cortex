import { NextRequest, NextResponse } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";
import { resolveEffectivePolicy } from "@/lib/policy-resolver";

export const dynamic = "force-dynamic";

/**
 * GET /api/policies
 * Backwards-compatible route used by the extension scanner.
 * Returns only rule array while delegating to canonical effective-policy resolver.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveSessionContext(req);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const effective = await resolveEffectivePolicy({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      email: ctx.email,
      workspaceId: "default",
    });

    return NextResponse.json(effective.resolvedPolicy.rules || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
