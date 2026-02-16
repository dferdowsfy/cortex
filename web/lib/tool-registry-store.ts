import { adminDb } from "./firebase/admin";
import type { AssetTool } from "./proxy-types";

const TOOLS_COLLECTION = "asset_inventory";

class ToolRegistryStore {
    async addTool(tool: Partial<AssetTool>): Promise<string> {
        const id = tool.id || `tool_${Date.now()}`;
        const newTool = {
            id,
            tool_name: tool.tool_name || "Unknown Tool",
            vendor: tool.vendor || "Unknown Vendor",
            category: tool.category || "General AI",
            deployment_type: tool.deployment_type || "SaaS",
            owner: tool.owner || "Unassigned",
            risk_tier: tool.risk_tier || "moderate",
            governance_status: tool.governance_status || "assessed",
            scanned_at: new Date().toISOString(),
            flag_count: tool.flag_count || 0,
            rec_count: tool.rec_count || 0,
            notes: tool.notes || "",
        };
        await adminDb.collection(TOOLS_COLLECTION).doc(id).set(newTool);
        return id;
    }

    async getTools(): Promise<AssetTool[]> {
        const snap = await adminDb.collection(TOOLS_COLLECTION).get();
        return snap.docs.map(d => d.data() as AssetTool);
    }

    async deleteTool(id: string): Promise<void> {
        await adminDb.collection(TOOLS_COLLECTION).doc(id).delete();
    }

    async getStats() {
        const tools = await this.getTools();
        const stats = {
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
        return stats;
    }
}

export const toolRegistryStore = new ToolRegistryStore();
