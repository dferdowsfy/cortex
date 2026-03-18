import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/extension/stats
 * Returns today's prompt stats for the current user (for popup display).
 */
export async function GET(req: NextRequest) {
    try {
        const uid = req.headers.get("X-User-UID");
        const email = req.headers.get("X-User-Email");
        const installationId = req.headers.get("X-Installation-ID");

        if (!uid && !email && !installationId) {
            return NextResponse.json({ scannedToday: 0, blockedToday: 0 });
        }

        const today = new Date().toISOString().split("T")[0];
        let scannedToday = 0;
        let blockedToday = 0;

        if (adminDb) {
            // Fetch all events for today from any workspace that this user appears in
            const eventsSnap = await adminDb.ref("workspaces").get();
            if (eventsSnap.exists()) {
                const workspaces = eventsSnap.val() as Record<string, any>;
                for (const ws of Object.values(workspaces)) {
                    const events = ws.proxy_events || {};
                    for (const evt of Object.values(events) as any[]) {
                        const isOurs = evt.user_hash === email || evt.user_hash === installationId || evt.user_hash === uid;
                        const isToday = evt.timestamp && evt.timestamp.startsWith(today);
                        if (isOurs && isToday) {
                            scannedToday++;
                            if (evt.blocked) blockedToday++;
                        }
                    }
                }
            }
        }

        return NextResponse.json({ scannedToday, blockedToday });
    } catch (err: any) {
        return NextResponse.json({ scannedToday: 0, blockedToday: 0 });
    }
}
