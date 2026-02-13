/**
 * /api/agent/heartbeat — POST & GET
 *
 * POST: The desktop agent pings this endpoint periodically to signal
 *        it's alive and proxying traffic.
 * GET:  The dashboard checks this to determine agent connectivity status.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

const HEARTBEAT_KEY = "proxy_config";
const HEARTBEAT_DOC = "agent_heartbeat";

// Agent sends heartbeat
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const heartbeat = {
            last_seen: new Date().toISOString(),
            agent_version: body.version || "1.0.0",
            hostname: body.hostname || "unknown",
            proxy_port: body.proxy_port || 8080,
            os: body.os || "macOS",
        };

        // Store heartbeat — we use the same Firestore persistence as proxy-store
        // but access it through a settings update to keep it simple
        await store.updateSettings({
            proxy_enabled: true,
            agent_last_seen: heartbeat.last_seen,
            agent_hostname: heartbeat.hostname,
        } as Record<string, unknown>);

        return NextResponse.json({
            status: "ok",
            received_at: heartbeat.last_seen,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Heartbeat failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// Dashboard checks agent status
export async function GET() {
    try {
        const settings = await store.getSettings();
        const s = settings as any;
        const lastSeen = s.agent_last_seen as string | undefined;
        const hostname = s.agent_hostname as string | undefined;

        let connected = false;
        let minutesAgo = -1;

        if (lastSeen) {
            const diff = Date.now() - new Date(lastSeen).getTime();
            minutesAgo = Math.floor(diff / 60_000);
            connected = minutesAgo < 5; // Agent is "connected" if heartbeat < 5 min ago
        }

        return NextResponse.json({
            connected,
            last_seen: lastSeen || null,
            hostname: hostname || null,
            minutes_ago: minutesAgo,
        });
    } catch {
        return NextResponse.json({ connected: false, last_seen: null });
    }
}
