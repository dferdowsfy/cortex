import { NextRequest, NextResponse } from "next/server";
import { agentStore } from "@/lib/agent-store";
import { enrollmentStore } from "@/lib/enrollment-store";

export const dynamic = "force-dynamic";

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

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || "default";

    try {
        // Pull from both the agent registry and the enrollment device store
        const [registryAgents, enrolledDevices] = await Promise.all([
            agentStore.listAgents(workspaceId),
            enrollmentStore.listAllDevices(workspaceId),
        ]);

        const now = Date.now();

        // Normalize agent registry → unified Agent shape
        const fromRegistry = registryAgents.map(a => ({
            device_id: a.device_id,
            hostname: a.hostname || a.device_id.substring(0, 12),
            os_type: a.os,          // AgentRegistration uses 'os'
            agent_version: a.version, // AgentRegistration uses 'version'
            last_sync: a.last_sync,
            status: a.status,       // Already "Healthy" | "Offline" etc.
        }));

        // Normalize enrolled devices → unified Agent shape
        const fromEnrollment = enrolledDevices.map(d => {
            const lastSeen = new Date(d.last_heartbeat).getTime();
            const isStale = now - lastSeen > OFFLINE_THRESHOLD_MS;
            return {
                device_id: d.device_id,
                hostname: d.device_name || d.device_id.substring(0, 12),
                os_type: d.os_type,
                agent_version: d.agent_version,
                last_sync: d.last_heartbeat,
                status: d.status === "revoked" ? "Offline" : isStale ? "Offline" : "Healthy",
            };
        });

        // Normalize to a plain serializable shape so the Map type is consistent
        type NormalizedAgent = {
            device_id: string;
            hostname: string;
            os_type: string;
            agent_version: string;
            last_sync: string;
            status: string;
        };

        // Merge: enrolled devices form base; registry entries override by device_id
        const deviceMap = new Map<string, NormalizedAgent>();
        fromEnrollment.forEach(d => deviceMap.set(d.device_id, d as NormalizedAgent));
        fromRegistry.forEach(d => deviceMap.set(d.device_id, d as NormalizedAgent));

        const agents = Array.from(deviceMap.values());
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
