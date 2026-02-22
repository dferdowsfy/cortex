import { adminFirestore } from "./firebase/admin";
import type { AssetTool } from "./proxy-types";
import { localStorage } from "./local-storage";

const TOOLS_COLLECTION = "asset_inventory";

class ToolRegistryStore {
    private getMemTools(): Record<string, AssetTool> {
        return localStorage.getItem("asset_inventory", {});
    }

    private setMemTools(tools: Record<string, AssetTool>) {
        localStorage.setItem("asset_inventory", tools);
    }

    async addTool(tool: Partial<AssetTool>): Promise<string> {
        const id = tool.id || `tool_${Date.now()}`;
        const newTool: AssetTool = {
            id,
            tool_name: tool.tool_name || "Unknown Tool",
            vendor: tool.vendor || "Unknown Vendor",
            category: tool.category || "General AI",
            deployment_type: tool.deployment_type || "SaaS",
            owner: tool.owner || "Unassigned",
            risk_tier: tool.risk_tier || ("moderate" as any),
            governance_status: tool.governance_status || ("assessed" as any),
            scanned_at: new Date().toISOString(),
            flag_count: tool.flag_count || 0,
            rec_count: tool.rec_count || 0,
            notes: tool.notes || "",
        };

        try {
            if (!adminFirestore) throw new Error("Firestore not initialized");
            await adminFirestore.collection(TOOLS_COLLECTION).doc(id).set(newTool);
        } catch (err) {
            console.warn("[tool-registry-store] Firestore addTool failed, using local storage:", err);
            const tools = this.getMemTools();
            tools[id] = newTool;
            this.setMemTools(tools);
        }
        return id;
    }

    async getTools(): Promise<AssetTool[]> {
        try {
            if (!adminFirestore) throw new Error("Firestore not initialized");
            const snap = await adminFirestore.collection(TOOLS_COLLECTION).get();
            const dbTools = snap.docs.map(d => d.data() as AssetTool);

            // Merge with local tools
            const localTools = this.getMemTools();
            const merged = { ...localTools };
            dbTools.forEach(t => { merged[t.id] = t; });
            return Object.values(merged);
        } catch (err) {
            return Object.values(this.getMemTools());
        }
    }

    async deleteTool(id: string): Promise<void> {
        try {
            if (adminFirestore) {
                await adminFirestore.collection(TOOLS_COLLECTION).doc(id).delete();
            }
        } catch { }
        const tools = this.getMemTools();
        delete tools[id];
        this.setMemTools(tools);
    }

    async getStats() {
        const tools = await this.getTools();
        return {
            total: tools.length,
            critical: tools.filter(t => t.risk_tier === "critical").length,
            high: tools.filter(t => t.risk_tier === "high").length,
            moderate: tools.filter(t => t.risk_tier === "moderate").length,
            low: tools.filter(t => t.risk_tier === "low").length,
            governance_coverage: tools.length > 0
                ? Math.round((tools.filter(t => t.governance_status === "assessed").length / tools.length) * 100)
                : 100,
            overdue_assessments: tools.filter(t => t.governance_status === "unassessed").length,
        };
    }
}

export const toolRegistryStore = new ToolRegistryStore();
