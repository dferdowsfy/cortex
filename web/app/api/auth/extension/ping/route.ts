import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/extension/ping
 *
 * Lightweight heartbeat endpoint called by the Chrome extension every 5 minutes.
 * Updates the device's last_heartbeat in RTDB so the dashboard can display
 * "Extension Health: ONLINE" rather than the default OFFLINE state.
 *
 * Headers expected (set by extension buildHeaders()):
 *   X-Installation-ID  — extension installation ID (device key in RTDB)
 *   X-User-UID         — Firebase UID of the logged-in user
 *   X-Organization-ID  — org ID for workspace routing
 *   X-User-Email       — user email (for logging)
 *
 * Returns:
 *   { ok: true, timestamp: ISO string }
 */
export async function POST(req: NextRequest) {
    try {
        const installationId = req.headers.get("X-Installation-ID");
        const uid = req.headers.get("X-User-UID");
        const orgId = req.headers.get("X-Organization-ID");
        const email = req.headers.get("X-User-Email");

        if (!installationId) {
            return NextResponse.json({ error: "X-Installation-ID header is required" }, { status: 400 });
        }

        const now = new Date().toISOString();

        if (adminDb) {
            // Update the device record so the agent heartbeat API can find it
            await adminDb.ref(`devices/${installationId}`).update({
                last_heartbeat: now,
                status: "active",
                os_type: "browser_extension",
                ...(uid ? { uid } : {}),
                ...(orgId ? { org_id: orgId } : {}),
                ...(email ? { email } : {}),
            });

            // Also write a per-org extension presence record for faster dashboard lookup
            const presenceRecord = {
                last_seen: now,
                uid: uid || "unknown",
                email: email || "unknown",
                shield_active: true,
                connection_status: "active",
            };

            if (orgId) {
                await adminDb.ref(`extension_health/${orgId}/${installationId}`).set(presenceRecord);
            }

            // Mirror heartbeat under the user's UID workspace as a fallback.
            // This keeps the dashboard online indicator working even when the
            // extension's orgId and the dashboard's workspace bootstrap differ.
            if (uid && uid !== orgId) {
                await adminDb.ref(`extension_health/${uid}/${installationId}`).set({
                    ...presenceRecord,
                    mirrored_from_org: orgId || null,
                });
            }

            console.log(`[extension/ping] Heartbeat from ${installationId} (${email}) at ${now}`);
        }

        return NextResponse.json({ ok: true, timestamp: now });
    } catch (err: any) {
        console.error("[extension/ping] Error:", err.message);
        // Non-fatal — return ok so extension doesn't retry aggressively
        return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
    }
}

/**
 * GET /api/auth/extension/ping
 *
 * Dashboard uses this to check if any extension is recently active for an org.
 * Query: ?orgId=xxx
 *
 * Returns:
 *   { connected: bool, last_seen: ISO|null, active_count: number }
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId") || searchParams.get("workspaceId");

    if (!orgId || !adminDb) {
        return NextResponse.json({ connected: false, last_seen: null, active_count: 0 });
    }

    try {
        const snap = await adminDb.ref(`extension_health/${orgId}`).get();
        if (!snap.exists()) {
            return NextResponse.json({ connected: false, last_seen: null, active_count: 0 });
        }

        const records = snap.val() as Record<string, { last_seen: string }>;
        const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();

        let latestSeen: string | null = null;
        let activeCount = 0;

        for (const rec of Object.values(records)) {
            const seenAt = new Date(rec.last_seen).getTime();
            if (now - seenAt < ONLINE_THRESHOLD_MS) {
                activeCount++;
                if (!latestSeen || rec.last_seen > latestSeen) {
                    latestSeen = rec.last_seen;
                }
            }
        }

        return NextResponse.json({
            connected: activeCount > 0,
            last_seen: latestSeen,
            active_count: activeCount,
        });
    } catch (err: any) {
        console.error("[extension/ping] GET error:", err.message);
        return NextResponse.json({ connected: false, last_seen: null, active_count: 0 });
    }
}
