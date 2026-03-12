import { NextRequest, NextResponse } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";
import { extensionSyncStore } from "@/lib/extension-sync-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "50");

  const events = await extensionSyncStore.feed(ctx.workspaceId, ctx.userId, limit);

  console.log(JSON.stringify({
    msg: "extension_event_feed_fetch",
    requestId: ctx.requestId,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    count: events.length,
  }));

  return NextResponse.json({ events });
}
