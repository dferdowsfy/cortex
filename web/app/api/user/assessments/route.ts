import { NextRequest, NextResponse } from "next/server";
import { assessmentStore } from "@/lib/assessment-store";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { workspaceId, toolId, toolData, assessmentData } = body;

        if (!workspaceId || !toolId) {
            return NextResponse.json({ error: "workspaceId and toolId are required" }, { status: 400 });
        }

        await assessmentStore.saveToolAndAssessment(workspaceId, toolId, toolData, assessmentData);
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

        const tools = await assessmentStore.getTools(workspaceId);
        return NextResponse.json({ tools });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
