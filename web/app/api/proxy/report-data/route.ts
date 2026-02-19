/**
 * /api/proxy/report-data — GET
 * Returns proxy-enriched report data for the board report generator.
 * Scoped to the authenticated user's workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import store from "@/lib/proxy-store";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";
    const reportData = await store.getReportData(workspaceId);
    return NextResponse.json(reportData);
}
