import { NextRequest, NextResponse } from "next/server";
import { assessmentStore } from "@/lib/assessment-store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ toolId: string }> }) {
    try {
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get("workspaceId");

        // Wait for dynamic route params
        const { toolId } = await params;

        if (!workspaceId) {
            return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        const assessment = await assessmentStore.getAssessment(workspaceId, toolId);
        return NextResponse.json({ assessment });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
