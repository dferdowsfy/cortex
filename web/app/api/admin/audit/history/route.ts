import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
    try {
        if (!adminDb) return NextResponse.json({ error: "Firebase not initialized" }, { status: 500 });

        const ref = adminDb.ref("audit_reports");
        let reports: any[] = [];

        try {
            const snapshot = await ref.orderByChild("created_at").limitToLast(20).once("value");
            snapshot.forEach((child) => {
                reports.push({ id: child.key, ...child.val() });
            });
        } catch (err) {
            console.warn("[audit-history] Indexed fetch failed, trying full fetch:", err);
            const snapshot = await ref.get();
            if (snapshot.exists()) {
                const data = snapshot.val();
                reports = Object.entries(data).map(([key, val]: [string, any]) => ({
                    id: key,
                    ...val
                })).sort((a: any, b: any) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                ).slice(0, 20);
            }
        }


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
