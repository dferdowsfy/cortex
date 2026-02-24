import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
    try {
        if (!adminDb) return NextResponse.json({ error: "Firebase not initialized" }, { status: 500 });

        const ref = adminDb.ref("audit_reports");
        // Get the last 20 reports
        const snapshot = await ref.orderByChild("created_at").limitToLast(20).once("value");

        const reports: any[] = [];
        snapshot.forEach((child) => {
            reports.push({
                id: child.key,
                ...child.val()
            });
        });

        // Reverse to show newest first
        return NextResponse.json({ reports: reports.reverse() });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
