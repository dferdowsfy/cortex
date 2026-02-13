/**
 * /api/proxy/report-data — GET
 * Returns proxy-enriched report data for the board report generator.
 */
import { NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET() {
    const reportData = await store.getReportData();
    return NextResponse.json(reportData);
}
