import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/user-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/me
 * Returns the current logged-in user's ManagedUser record.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId") || "default";

        // In this system, workspaceId IS the user's UID when coming from the dashboard
        let user = await userStore.getUser(workspaceId, workspaceId);

        // Hardcode-ish fallback for the platform owner during the transition
        if (!user && workspaceId !== "default") {
            // Check if we can find them by a known email if we had it, 
            // but here we just know their UID.
            // If they are dferdows, we might want to auto-create their record in org_root.
        }

        return NextResponse.json({ user });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
