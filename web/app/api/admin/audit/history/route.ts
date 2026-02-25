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

        console.log(`[audit-history] Found ${reports.length} reports in Firebase`);

        // FALLBACK FOR DEBUGGING: If empty, add a dummy report to see if UI can render it
        if (reports.length === 0) {
            console.log("[audit-history] Sending mock report for UI testing");
            reports.push({
                id: "mock-123",
                timestamp: new Date().toISOString(),
                enforcementScore: 95,
                overallStatus: "HEALTHY",
                findings: []
            });
        }

        // Reverse to show newest first
        return NextResponse.json({ reports: reports.reverse() });
    } catch (e: any) {
        console.error("Audit history API error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
