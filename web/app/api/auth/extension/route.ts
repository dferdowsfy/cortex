import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminApp } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { enrollmentStore } from "@/lib/enrollment-store";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/extension
 *
 * Called by the browser extension after Firebase sign-in.
 * Two jobs:
 *   1. Verify the Firebase ID token with Admin SDK
 *   2. Look up the user's org membership, register the installation as a Device,
 *      and return a short-lived SSO token so the web dashboard can sign them in automatically.
 *
 * Body: { idToken, uid, email, displayName, installationId, agentVersion }
 * Response: { orgId, orgName, shieldActive, ssoToken, dashboardUrl }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { idToken, uid, email, displayName, installationId, agentVersion } = body;

        if (!idToken || !email) {
            return NextResponse.json({ error: "idToken and email are required" }, { status: 400 });
        }

        // ── 1. Verify Firebase ID token ──────────────────────────────────────
        let verifiedUid = uid;
        let verifiedEmail = email;

        try {
            const authAdmin = getAuth(adminApp);
            const decoded = await authAdmin.verifyIdToken(idToken);
            verifiedUid = decoded.uid;
            verifiedEmail = decoded.email || email;
        } catch (verifyErr) {
            console.warn("[auth/extension] Token verification failed, using client-provided claims:", verifyErr);
            // In DEBUG_BYPASS mode we continue with client-supplied claims
            if (!process.env.DEBUG_BYPASS) {
                return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
            }
        }

        // ── 2. Look up org membership from RTDB ──────────────────────────────
        let orgId: string | null = null;
        let orgName = "No Org";
        let shieldActive = true;

        try {
            if (adminDb) {
                // Search users node by email
                const usersSnap = await adminDb.ref("extension_users").orderByChild("email").equalTo(verifiedEmail).get();
                if (usersSnap.exists()) {
                    const userData = Object.values(usersSnap.val() as Record<string, any>)[0] as any;
                    orgId = userData.orgId || null;
                    shieldActive = userData.shieldActive !== false;
                }

                // Fallback: search organizations by member email
                if (!orgId) {
                    const orgsSnap = await adminDb.ref("organizations").get();
                    if (orgsSnap.exists()) {
                        const orgs = orgsSnap.val() as Record<string, any>;
                        for (const [id, org] of Object.entries(orgs)) {
                            if (org.members && org.members[verifiedEmail.replace(/\./g, ',')]) {
                                orgId = id;
                                orgName = org.name || id;
                                break;
                            }
                        }
                    }
                } else {
                    const orgSnap = await adminDb.ref(`organizations/${orgId}`).get();
                    if (orgSnap.exists()) orgName = orgSnap.val().name || orgId;
                }

                // ── 3. Upsert user record in extension_users ─────────────────
                const userKey = verifiedUid;
                await adminDb.ref(`extension_users/${userKey}`).update({
                    uid: verifiedUid,
                    email: verifiedEmail,
                    displayName: displayName || verifiedEmail.split("@")[0],
                    orgId: orgId || null,
                    lastSeen: new Date().toISOString(),
                    shieldActive,
                });

                // ── 4. Register / update device (Extension Installation) ──────
                if (installationId) {
                    await adminDb.ref(`devices/${installationId}`).update({
                        device_id: installationId,
                        uid: verifiedUid,
                        email: verifiedEmail,
                        org_id: orgId || "none",
                        os_type: "browser_extension",
                        agent_version: agentVersion || "1.1.0",
                        last_heartbeat: new Date().toISOString(),
                        status: "active",
                        enrolled_at: (await adminDb.ref(`devices/${installationId}/enrolled_at`).get()).val()
                            || new Date().toISOString(),
                    });
                    console.log("[auth/extension] Device registered:", installationId, "for", verifiedEmail);
                }
            }
        } catch (dbErr) {
            console.error("[auth/extension] RTDB operations failed:", dbErr);
            // Non-fatal — return minimal response
        }

        // ── 5. Generate a short-lived SSO token for web auto-login ────────────
        // This token lets the web app sign in the same user without re-entering credentials.
        const ssoToken = crypto.randomBytes(24).toString("base64url");
        const ssoPayload = {
            uid: verifiedUid,
            email: verifiedEmail,
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        };

        if (adminDb) {
            await adminDb.ref(`sso_tokens/${ssoToken}`).set(ssoPayload);
        }

        return NextResponse.json({
            ok: true,
            uid: verifiedUid,
            email: verifiedEmail,
            displayName: displayName || verifiedEmail.split("@")[0],
            orgId,
            orgName,
            shieldActive,
            ssoToken,
            dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3737",
        });

    } catch (err: any) {
        console.error("[auth/extension] POST error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

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
