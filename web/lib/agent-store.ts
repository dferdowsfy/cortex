import { adminDb } from "./firebase/admin";
import type { AgentRegistration, AgentStatus } from "./proxy-types";

const AGENTS_COLLECTION = "agent_registry";

// In-memory fallback
const memAgents = new Map<string, AgentRegistration>();

class AgentStore {
    async registerAgent(agent: AgentRegistration): Promise<void> {
        try {
            await adminDb.collection(AGENTS_COLLECTION).doc(agent.device_id).set({
                ...agent,
                updated_at: new Date().toISOString(),
            });
        } catch (err) {
            console.warn("[agent-store] Firestore registerAgent failed, using cache:", err);
            memAgents.set(agent.device_id, agent);
        }
    }

    async updateHeartbeat(deviceId: string, data: Partial<AgentRegistration>): Promise<void> {
        try {
            await adminDb.collection(AGENTS_COLLECTION).doc(deviceId).update({
                ...data,
                last_sync: new Date().toISOString(),
                status: "Healthy",
            });
        } catch (err) {
            console.warn("[agent-store] Firestore updateHeartbeat failed:", err);
            const existing = memAgents.get(deviceId);
            if (existing) {
                memAgents.set(deviceId, { ...existing, ...data, last_sync: new Date().toISOString(), status: "Healthy" });
            }
        }
    }

    async getAgent(deviceId: string): Promise<AgentRegistration | null> {
        try {
            const doc = await adminDb.collection(AGENTS_COLLECTION).doc(deviceId).get();
            return doc.exists ? (doc.data() as AgentRegistration) : memAgents.get(deviceId) || null;
        } catch (err) {
            return memAgents.get(deviceId) || null;
        }
    }

    async listAgents(): Promise<AgentRegistration[]> {
        let agents: AgentRegistration[] = [];
        try {
            const snap = await adminDb.collection(AGENTS_COLLECTION).get();
            agents = snap.docs.map(d => d.data() as AgentRegistration);
        } catch (err) {
            console.warn("[agent-store] listAgents Firestore error:", err);
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
        await adminDb.collection("installation_logs").add({
            ...log,
            timestamp: new Date().toISOString(),
        });
    }
}

export const agentStore = new AgentStore();
