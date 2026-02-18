import { NextRequest, NextResponse } from "next/server";
import { agentStore } from "@/lib/agent-store";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { device_id, workspace_id, ...updates } = body;

        if (!device_id) {
            return NextResponse.json({ error: "device_id is required" }, { status: 400 });
        }

        const wsId = workspace_id || "default";
        await agentStore.updateHeartbeat(device_id, updates, wsId);

        return NextResponse.json({
            status: "ok",
            timestamp: new Date().toISOString(),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";

    try {
        const agents = await agentStore.listAgents(workspaceId);
        const primaryAgent = agents.find(a => a.status === "Healthy") || agents[0] || null;

        return NextResponse.json({
            agents,
            primary: primaryAgent,
            connected: primaryAgent?.status === "Healthy",
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
