import { NextRequest, NextResponse } from "next/server";
import { agentStore } from "@/lib/agent-store";
import type { AgentRegistration } from "@/lib/proxy-types";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const agent: AgentRegistration = {
            device_id: body.device_id || `dev_${Math.random().toString(36).substr(2, 9)}`,
            hostname: body.hostname || "unknown",
            os: body.os || "macOS",
            version: body.version || "1.2.0",
            status: "Healthy",
            last_sync: new Date().toISOString(),
            heartbeat_interval: 60,
            workspace_id: body.workspace_id || "default",
            service_connectivity: true,
            traffic_routing: true,
            os_integration: true,
        };

        await agentStore.registerAgent(agent);

        return NextResponse.json({
            status: "success",
            agent,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
