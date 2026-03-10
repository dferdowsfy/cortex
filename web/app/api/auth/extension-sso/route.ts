import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminApp } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/extension-sso
 *
 * Validates a short-lived SSO token created by /api/auth/extension.
 * Returns a Firebase Custom Token that the web client uses to sign in.
 *
 * Body: { ssoToken: string }
 * Response: { customToken: string, uid: string, email: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { ssoToken } = await req.json();
        if (!ssoToken) {
            return NextResponse.json({ error: "ssoToken is required" }, { status: 400 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: "Database not available" }, { status: 503 });
        }

        // ── 1. Look up and validate SSO token in RTDB ────────────────────────
        const snap = await adminDb.ref(`sso_tokens/${ssoToken}`).get();
        if (!snap.exists()) {
            return NextResponse.json({ error: "Invalid or expired SSO token" }, { status: 401 });
        }

        const tokenData = snap.val() as { uid: string; email: string; expires: number };

        // Check expiry (5-minute window)
        if (Date.now() > tokenData.expires) {
            await adminDb.ref(`sso_tokens/${ssoToken}`).remove();
            return NextResponse.json({ error: "SSO token has expired. Please re-open from the extension." }, { status: 401 });
        }

        // ── 2. Consume token (one-time use) ──────────────────────────────────
        await adminDb.ref(`sso_tokens/${ssoToken}`).remove();

        // ── 3. Create Firebase Custom Token for this UID ─────────────────────
        const authAdmin = getAuth(adminApp);
        const customToken = await authAdmin.createCustomToken(tokenData.uid, {
            email: tokenData.email,
            via: "extension_sso",
        });

        console.log(`[auth/extension-sso] SSO sign-in for ${tokenData.email} (${tokenData.uid})`);

        return NextResponse.json({
            customToken,
            uid: tokenData.uid,
            email: tokenData.email,
        });

    } catch (err: any) {
        console.error("[auth/extension-sso] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
