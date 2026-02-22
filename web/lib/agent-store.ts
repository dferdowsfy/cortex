import { adminDb } from "./firebase/admin";
import type { AgentRegistration } from "./proxy-types";
import { localStorage } from "./local-storage";

const AGENTS_PATH = "agent_registry";

class AgentStore {
    private getMemAgents(workspaceId: string): Record<string, AgentRegistration> {
        const agents = localStorage.getWorkspaceData(workspaceId, "agents", {});
        if (Object.keys(agents).length === 0 && workspaceId !== "default") {
            return localStorage.getWorkspaceData("default", "agents", {});
        }
        return agents;
    }

    private setMemAgents(workspaceId: string, agents: Record<string, AgentRegistration>) {
        localStorage.setWorkspaceData(workspaceId, "agents", agents);
    }

    async registerAgent(agent: AgentRegistration): Promise<void> {
        const workspaceId = agent.workspace_id || "default";
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("Database not initialized");
            await adminDb.ref(`${AGENTS_PATH}/${workspaceId}/${agent.device_id}`).set({
                ...agent,
                last_sync: new Date().toISOString(),
            });
        } catch (err) {
            console.warn("[agent-store] RTDB registerAgent failed, using local storage:", err);
            const agents = this.getMemAgents(workspaceId);
            agents[agent.device_id] = {
                ...agent,
                last_sync: new Date().toISOString(),
            };
            this.setMemAgents(workspaceId, agents);
        }
    }

    async updateHeartbeat(deviceId: string, data: Partial<AgentRegistration>, workspaceId: string = "default"): Promise<void> {
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("DB Unavailable");
            await adminDb.ref(`${AGENTS_PATH}/${workspaceId}/${deviceId}`).update({
                ...data,
                last_sync: new Date().toISOString(),
                status: "Healthy",
            });
        } catch (err) {
            console.warn("[agent-store] RTDB updateHeartbeat failed:", err);
            const agents = this.getMemAgents(workspaceId);
            const existing = agents[deviceId] || {};
            const defaults: AgentRegistration = {
                device_id: deviceId,
                hostname: "unknown",
                os: "macOS",
                version: "1.0.0",
                heartbeat_interval: 30,
                workspace_id: workspaceId,
                service_connectivity: true,
                traffic_routing: true,
                os_integration: true,
                status: "Healthy",
                last_sync: new Date().toISOString(),
            };
            agents[deviceId] = { ...defaults, ...existing, ...data, last_sync: new Date().toISOString(), status: "Healthy" };
            this.setMemAgents(workspaceId, agents);
        }
    }

    async getAgent(deviceId: string, workspaceId: string = "default"): Promise<AgentRegistration | null> {
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("DB Unavailable");
            const snap = await adminDb.ref(`${AGENTS_PATH}/${workspaceId}/${deviceId}`).get();
            if (snap.exists()) return snap.val() as AgentRegistration;
            return this.getMemAgents(workspaceId)[deviceId] || null;
        } catch (err) {
            return this.getMemAgents(workspaceId)[deviceId] || null;
        }
    }

    async listAgents(workspaceId: string = "default"): Promise<AgentRegistration[]> {
        let agentsDict: Record<string, AgentRegistration> = {};
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("DB Unavailable");
            const snap = await adminDb.ref(`${AGENTS_PATH}/${workspaceId}`).get();
            if (snap.exists()) {
                agentsDict = snap.val() as Record<string, AgentRegistration>;
            }
        } catch (err) {
            console.warn("[agent-store] listAgents RTDB error:", err);
            agentsDict = this.getMemAgents(workspaceId);
        }

        // Merge with local agents that might not be in DB yet
        const localAgents = this.getMemAgents(workspaceId);
        const merged = { ...agentsDict, ...localAgents };
        const agents = Object.values(merged);

        // Check for offline agents (no heartbeat in 3 mins)
        const now = Date.now();
        const updatedAgents = agents.map(agent => {
            const lastSeen = new Date(agent.last_sync).getTime();
            if (now - lastSeen > 180000 && agent.status !== "Offline" && agent.status !== "Connecting") {
                agent.status = "Offline";
            }
            return agent;
        });

        return updatedAgents;
    }

    async logInstallation(log: any): Promise<void> {
        if (!adminDb) return;
        const id = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        try {
            await adminDb.ref(`installation_logs/${id}`).set({
                ...log,
                timestamp: new Date().toISOString(),
            });
        } catch {
            // Fallback for logs if needed, but not critical
        }
    }
}

export const agentStore = new AgentStore();
