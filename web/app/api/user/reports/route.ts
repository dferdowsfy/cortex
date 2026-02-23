import { NextRequest, NextResponse } from "next/server";
import { assessmentStore } from "@/lib/assessment-store";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { workspaceId, reportData } = body;

        if (!workspaceId || !reportData) {
            return NextResponse.json({ error: "workspaceId and reportData are required" }, { status: 400 });
        }

        await assessmentStore.saveReport(workspaceId, reportData);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId");

        if (!workspaceId) {
            return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        const reports = await assessmentStore.getReports(workspaceId);
        return NextResponse.json({ reports });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
