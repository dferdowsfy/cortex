import { adminDb } from "./firebase/admin";
import type { AgentRegistration, AgentStatus } from "./proxy-types";

const AGENTS_PATH = "agent_registry";

// In-memory fallback
const memAgents = new Map<string, AgentRegistration>();

class AgentStore {
    async registerAgent(agent: AgentRegistration): Promise<void> {
        const workspaceId = agent.workspace_id || "default";
        try {
            if (!adminDb) throw new Error("Database not initialized");
            await adminDb.ref(`${AGENTS_PATH}/${workspaceId}/${agent.device_id}`).set({
                ...agent,
                updated_at: new Date().toISOString(),
            });
        } catch (err) {
            console.warn("[agent-store] RTDB registerAgent failed, using cache:", err);
            memAgents.set(agent.device_id, agent);
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
            const existing = memAgents.get(deviceId);
            if (existing) {
                memAgents.set(deviceId, { ...existing, ...data, last_sync: new Date().toISOString(), status: "Healthy" });
            }
        }
    }

    async getAgent(deviceId: string, workspaceId: string = "default"): Promise<AgentRegistration | null> {
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("DB Unavailable");
            const snap = await adminDb.ref(`${AGENTS_PATH}/${workspaceId}/${deviceId}`).get();
            return snap.exists() ? (snap.val() as AgentRegistration) : memAgents.get(deviceId) || null;
        } catch (err) {
            return memAgents.get(deviceId) || null;
        }
    }

    async listAgents(workspaceId: string = "default"): Promise<AgentRegistration[]> {
        let agents: AgentRegistration[] = [];
        try {
            if (!adminDb || !adminDb.app.options.databaseURL) throw new Error("DB Unavailable");
            const snap = await adminDb.ref(`${AGENTS_PATH}/${workspaceId}`).get();
            if (snap.exists()) {
                const data = snap.val() as Record<string, AgentRegistration>;
                agents = Object.values(data);
            }
        } catch (err) {
            console.warn("[agent-store] listAgents RTDB error:", err);
            agents = Array.from(memAgents.values());
        }

        // Merge with memory agents that might not be in DB yet
        const dbIds = new Set(agents.map(a => a.device_id));
        for (const [id, agent] of memAgents.entries()) {
            if (!dbIds.has(id)) agents.push(agent);
        }

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
        const id = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await adminDb.ref(`installation_logs/${id}`).set({
            ...log,
            timestamp: new Date().toISOString(),
        });
    }
}

export const agentStore = new AgentStore();
