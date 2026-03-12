import { NextRequest, NextResponse } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  console.log(JSON.stringify({
    msg: "session_context_resolved",
    requestId: ctx.requestId,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    groupIds: ctx.groupIds,
  }));

  return NextResponse.json(ctx);
}
