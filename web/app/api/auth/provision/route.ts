import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getFeaturesForPlan } from "@/lib/plans";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/provision
 * 
 * Called after a successful web signup to ensure the user 
 * has an organization and a profile record in extension_users.
 */
export async function POST(req: NextRequest) {
    try {
        const { uid, email, displayName } = await req.json();

        if (!uid || !email) {
            return NextResponse.json({ error: "uid and email are required" }, { status: 400 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
        }

        let orgId: string | null = null;
        let orgName = "No Org";
        let plan = "STARTER";
        let role = "owner";
        let features: any = null;

        const userEmailKey = email.replace(/\./g, ",");

        // 1. Check if user already has an org (e.g. they were invited before signing up)
        const orgsSnap = await adminDb.ref("organizations").get();
        if (orgsSnap.exists()) {
            const orgs = orgsSnap.val() as Record<string, any>;
            for (const [id, org] of Object.entries(orgs)) {
                if (org.members && org.members[userEmailKey]) {
                    orgId = id;
                    orgName = org.name || id;
                    plan = org.plan || "STARTER";
                    role = org.members[userEmailKey].role || "member";
                    break;
                }
            }
        }

        // 2. Create default Org if still none found
        if (!orgId) {
            orgId = crypto.randomUUID();
            orgName = `${email.split('@')[0]}'s Workspace`;
            plan = "STARTER";
            role = "owner";

            const newOrg = {
                id: orgId,
                name: orgName,
                plan: "STARTER",
                seatsPurchased: 1,
                seatsUsed: 1,
                ownerUserId: email,
                createdAt: new Date().toISOString(),
                members: {
                    [userEmailKey]: {
                        email,
                        role: "owner",
                        joinedAt: new Date().toISOString()
                    }
                }
            };
            await adminDb.ref(`organizations/${orgId}`).set(newOrg);
            console.log("[auth/provision] Provisioned new STARTER org for web signup:", email);
        } else {
            console.log("[auth/provision] User already belongs to org:", orgId);
        }

        // 3. Resolve Features
        features = getFeaturesForPlan(plan);

        // 4. Upsert User Profile
        await adminDb.ref(`extension_users/${uid}`).update({
            uid,
            email,
            displayName: displayName || email.split("@")[0],
            orgId,
            lastSeen: new Date().toISOString(),
            shieldActive: true,
            plan,
            role,
            features
        });

        // 5. Also update legacy profile location if needed for dashboard compatibility
        await adminDb.ref(`users/${uid}/profile`).update({
            uid,
            email,
            displayName: displayName || email.split("@")[0],
            role: "admin",
            organizationId: orgId,
            createdAt: new Date().toISOString()
        });

        return NextResponse.json({ ok: true, orgId, plan });

    } catch (err: any) {
        console.error("[auth/provision] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
