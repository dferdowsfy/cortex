import { NextRequest, NextResponse } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";
import { extensionSyncStore, type ExtensionEvent, type ExtensionEventType } from "@/lib/extension-sync-store";

export const dynamic = "force-dynamic";

const ALLOWED_EVENT_TYPES: ExtensionEventType[] = [
  "PROMPT_SCANNED",
  "PROMPT_ALLOWED",
  "PROMPT_BLOCKED",
  "PROMPT_REDACTED",
  "AUDIT_ONLY_FLAGGED",
  "POLICY_FETCHED",
  "POLICY_APPLIED",
  "POLICY_FETCH_FAILED",
  "EVENT_SYNC_FAILED",
];

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  if (!body?.eventId || !body?.eventType) {
    return NextResponse.json({ error: "eventId and eventType are required" }, { status: 400 });
  }

  if (!ALLOWED_EVENT_TYPES.includes(body.eventType)) {
    return NextResponse.json({ error: `Unsupported eventType: ${body.eventType}` }, { status: 400 });
  }

  const event: ExtensionEvent = {
    ...body,
    timestamp: body.timestamp || new Date().toISOString(),
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    groupIds: ctx.groupIds,
  };

  const saved = await extensionSyncStore.ingest(event, ctx.workspaceId);
  console.log(JSON.stringify({
    msg: "extension_event_ingested",
    requestId: ctx.requestId,
    eventId: saved.eventId,
    eventType: saved.eventType,
    userId: saved.userId,
    organizationId: saved.organizationId,
    policyVersion: saved.policyVersion,
  }));

  return NextResponse.json({ ok: true, eventId: saved.eventId, syncedAt: saved.syncedAt });
}
