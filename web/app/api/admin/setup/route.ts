import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { PLANS } from "@/lib/saas-types";

/**
 * POST /api/admin/setup
 * 
 * One-time setup to create a Super Admin and seed plans.
 * PROTECT THIS OR REMOVE AFTER USE.
 */
export async function GET(req: NextRequest) {
    if (!adminDb) return NextResponse.json({ error: "No DB" }, { status: 500 });
    try {
        // Fallback for missing index: fetch all and find in memory
        const snap = await adminDb.ref("managed_users").get();
        if (snap.exists()) {
            const allUsers = Object.values(snap.val()) as any[];
            const superAdmin = allUsers.find(u => u.role === "super_admin");
            if (superAdmin) {
                return NextResponse.json({ initialized: true, super_admin: superAdmin.email });
            }
        }
        return NextResponse.json({ initialized: false });
    } catch (err: any) {
        console.error("[api/admin/setup] GET error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!adminDb) return NextResponse.json({ error: "No DB" }, { status: 500 });

    try {
        const { super_admin_id, email, organization_name } = await req.json();

        if (!super_admin_id || !email) {
            return NextResponse.json({ error: "Missing super_admin_id or email" }, { status: 400 });
        }

        // 1. Seed Plans
        await adminDb.ref("plans").set(PLANS);

        // 2. Create the Root Organization
        const org_id = "org_root";
        await adminDb.ref(`organizations/${org_id}`).set({
            name: organization_name || "Complyze Global",
            plan_id: "enterprise",
            seats_purchased: 10000,
            seats_used: 1,
            created_at: new Date().toISOString()
        });

        // 3. Create the Super Admin User
        await adminDb.ref(`managed_users/${super_admin_id}`).set({
            user_id: super_admin_id,
            org_id: org_id,
            email: email,
            role: "super_admin",
            active: true,
            created_at: new Date().toISOString(),
            display_name: "Root Administrator",
            enrolled_device_count: 0,
            license_key: "CMP-SUPER-ADMIN-001"
        });

        return NextResponse.json({ status: "ok", message: "Super Admin and Plans seeded." });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
