import { NextRequest } from "next/server";
import { resolveSessionContext } from "@/lib/session-context";
import { extensionSyncStore } from "@/lib/extension-sync-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time extension event streaming.
 * Uses Firebase's onValue listener under the hood to push new events
 * to the dashboard immediately without polling.
 *
 * Dashboard connects with:
 *   const es = new EventSource("/api/events/stream");
 *   es.onmessage = (e) => { const events = JSON.parse(e.data); ... };
 */
export async function GET(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", workspaceId: ctx.workspaceId })}\n\n`));

      // Subscribe to real-time events from RTDB
      unsubscribe = extensionSyncStore.subscribe(
        ctx.workspaceId,
        (events) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "events", events: events.slice(0, 50) })}\n\n`)
            );
          } catch {
            // Stream may have been closed
          }
        },
        ctx.userId
      );

      // If no real-time listener available, fall back to periodic polling
      if (!unsubscribe) {
        const interval = setInterval(async () => {
          try {
            const events = await extensionSyncStore.feed(ctx.workspaceId, ctx.userId, 50);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "events", events })}\n\n`)
            );
          } catch {
            // non-fatal
          }
        }, 5000);

        unsubscribe = () => clearInterval(interval);
      }
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
