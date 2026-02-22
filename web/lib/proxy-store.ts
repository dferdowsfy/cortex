/**
 * Proxy Store — RTDB-backed persistence for both local and Vercel.
 *
 * Settings, events, and alerts are stored in Firebase Realtime Database
 * so they survive across Vercel serverless cold-starts and function instances.
 *
 * Falls back to in-memory storage if RTDB is unavailable.
 */

import type {
    ProxySettings,
    ActivityEvent,
    ActivitySummary,
    DynamicToolRisk,
    ProxyAlert,
    ProxyReportData
} from "./proxy-types";
import { localStorage } from "./local-storage";

// ── Default settings ─────────────────────────────────────────
const DEFAULT_SETTINGS: ProxySettings = {
    proxy_enabled: true,
    full_audit_mode: false,
    block_high_risk: false,
    redact_sensitive: false,
    alert_on_violations: false,
    desktop_bypass: false,
    retention_days: 90,
    proxy_endpoint: "127.0.0.1:8080",
    inspect_attachments: false,
    updated_at: new Date().toISOString(),
};

// ── RTDB helpers (lazy-loaded) ───────────────────────────────
import type { database } from "firebase-admin";
let rtdbInstance: database.Database | null = null;
let rtdbInitAttempted = false;

function getDb(): database.Database | null {
    if (rtdbInstance) return rtdbInstance;
    if (rtdbInitAttempted) return null;
    rtdbInitAttempted = true;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { adminDb } = require("./firebase/admin");
        rtdbInstance = adminDb;
        return rtdbInstance;
    } catch (err) {
        console.warn("[proxy-store] RTDB not available, using in-memory fallback:", err);
        return null;
    }
}

// ── Fallback helpers ─────────────────────────────────────────
function getMemSettings(workspaceId: string): ProxySettings {
    const mem = localStorage.getWorkspaceData(workspaceId, "settings", null);
    if (!mem && workspaceId !== "default") return localStorage.getWorkspaceData("default", "settings", { ...DEFAULT_SETTINGS });
    return mem || { ...DEFAULT_SETTINGS };
}

function getMemEvents(workspaceId: string): ActivityEvent[] {
    const mem = localStorage.getWorkspaceData(workspaceId, "events", []);
    if (mem.length === 0 && workspaceId !== "default") return localStorage.getWorkspaceData("default", "events", []);
    return mem;
}

function getMemAlerts(workspaceId: string): ProxyAlert[] {
    const mem = localStorage.getWorkspaceData(workspaceId, "alerts", []);
    if (mem.length === 0 && workspaceId !== "default") return localStorage.getWorkspaceData("default", "alerts", []);
    return mem;
}

function setMemSettings(workspaceId: string, settings: ProxySettings) {
    localStorage.setWorkspaceData(workspaceId, "settings", settings);
    if (workspaceId !== "default") {
        localStorage.setWorkspaceData("default", "settings", settings);
    }
}

function setMemEvents(workspaceId: string, events: ActivityEvent[]) {
    localStorage.setWorkspaceData(workspaceId, "events", events);
}

function setMemAlerts(workspaceId: string, alerts: ProxyAlert[]) {
    localStorage.setWorkspaceData(workspaceId, "alerts", alerts);
}

// ── RTDB paths ───────────────────────────────────────────────
const SETTINGS_PATH = "proxy_config/settings";
const EVENTS_PATH = "proxy_events";
const ALERTS_PATH = "proxy_alerts";

class ProxyStore {
    // ── Settings ─────────────────────────────────────────────
    async getSettings(workspaceId: string = "default"): Promise<ProxySettings> {
        const db = getDb();
        if (!db) return getMemSettings(workspaceId);

        // Use the unified UserSettings path for the single source of truth
        const path = `users/${workspaceId}/settings`;
        try {
            const snap = await db.ref(path).get();
            if (snap.exists()) {
                const userSettings = snap.val();
                // Map camelCase (UserSettings) to snake_case (ProxySettings)
                return {
                    proxy_enabled: userSettings.proxyEnabled ?? DEFAULT_SETTINGS.proxy_enabled,
                    full_audit_mode: userSettings.fullAuditMode ?? DEFAULT_SETTINGS.full_audit_mode,
                    block_high_risk: userSettings.blockHighRisk ?? DEFAULT_SETTINGS.block_high_risk,
                    redact_sensitive: userSettings.redactSensitive ?? DEFAULT_SETTINGS.redact_sensitive,
                    alert_on_violations: userSettings.alertOnViolations ?? DEFAULT_SETTINGS.alert_on_violations,
                    desktop_bypass: userSettings.desktopBypass ?? DEFAULT_SETTINGS.desktop_bypass,
                    retention_days: userSettings.retentionDays ?? DEFAULT_SETTINGS.retention_days,
                    proxy_endpoint: DEFAULT_SETTINGS.proxy_endpoint,
                    inspect_attachments: userSettings.inspectAttachments ?? DEFAULT_SETTINGS.inspect_attachments,
                    updated_at: new Date(userSettings.updatedAt || Date.now()).toISOString(),
                };
            }

            // If no settings exist at users/{id}/settings, fallback to older proxy_config path or default
            const fallbackPath = `workspaces/${workspaceId}/${SETTINGS_PATH}`;
            const fallbackSnap = await db.ref(fallbackPath).get();
            if (fallbackSnap.exists()) {
                const settings = fallbackSnap.val() as ProxySettings;
                setMemSettings(workspaceId, settings);
                return settings;
            }

            return getMemSettings(workspaceId);
        } catch (err) {
            console.warn("[proxy-store] getSettings RTDB error, using memory:", err);
            return getMemSettings(workspaceId);
        }
    }

    async updateSettings(newSettings: Partial<ProxySettings>, workspaceId: string = "default"): Promise<ProxySettings> {
        const current = await this.getSettings(workspaceId);
        const updated: ProxySettings = {
            ...current,
            ...newSettings,
            updated_at: new Date().toISOString(),
        };

        const db = getDb();
        if (db) {
            try {
                // Keep the old proxy_config updated for any lingering old clients/agents
                const oldPath = `workspaces/${workspaceId}/${SETTINGS_PATH}`;
                await db.ref(oldPath).set(updated);

                // Update the unified UserSettings path mapping snake_case to camelCase
                const unifiedPath = `users/${workspaceId}/settings`;
                const unifiedPatch: Record<string, any> = {};

                if ('proxy_enabled' in newSettings) unifiedPatch.proxyEnabled = newSettings.proxy_enabled;
                if ('full_audit_mode' in newSettings) unifiedPatch.fullAuditMode = newSettings.full_audit_mode;
                if ('block_high_risk' in newSettings) unifiedPatch.blockHighRisk = newSettings.block_high_risk;
                if ('redact_sensitive' in newSettings) unifiedPatch.redactSensitive = newSettings.redact_sensitive;
                if ('alert_on_violations' in newSettings) unifiedPatch.alertOnViolations = newSettings.alert_on_violations;
                if ('desktop_bypass' in newSettings) unifiedPatch.desktopBypass = newSettings.desktop_bypass;
                if ('retention_days' in newSettings) unifiedPatch.retentionDays = newSettings.retention_days;
                if ('inspect_attachments' in newSettings) unifiedPatch.inspectAttachments = newSettings.inspect_attachments;
                unifiedPatch.updatedAt = Date.now();

                if (Object.keys(unifiedPatch).length > 1) { // >1 because updatedAt is always set
                    await db.ref(unifiedPath).update(unifiedPatch);
                }
            } catch (err) {
                console.warn("[proxy-store] updateSettings RTDB error:", err);
            }
        }

        setMemSettings(workspaceId, updated);
        return updated;
    }

    // ── Events ───────────────────────────────────────────────
    async addEvent(event: ActivityEvent, workspaceId: string = "default"): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                const path = `workspaces/${workspaceId}/${EVENTS_PATH}/${event.id}`;
                await db.ref(path).set({
                    ...event,
                    workspace_id: workspaceId,
                    _created_at: new Date().toISOString(),
                });
            } catch (err) {
                console.warn("[proxy-store] addEvent RTDB error:", err);
            }
        }

        const memEvents = getMemEvents(workspaceId);
        memEvents.unshift(event);
        if (memEvents.length > 1000) memEvents.pop();
        setMemEvents(workspaceId, memEvents);

        // Auto-register tool in inventory
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { toolRegistryStore } = require("./tool-registry-store");
            toolRegistryStore.addTool({
                id: event.tool.toLowerCase().replace(/[^a-z0-9]/g, "_"),
                tool_name: event.tool,
                vendor: event.tool_domain,
                risk_tier: event.risk_category as any,
            }).catch(() => { });
        } catch { }

        await this.checkThresholds(event, workspaceId);
    }

    async getEvents(workspaceId: string = "default", limitCount = 50): Promise<ActivityEvent[]> {
        const db = getDb();
        if (db) {
            try {
                const path = `workspaces/${workspaceId}/${EVENTS_PATH}`;
                const snap = await db
                    .ref(path)
                    .orderByChild("_created_at")
                    .limitToLast(limitCount)
                    .get();
                if (snap.exists()) {
                    const data = snap.val() as Record<string, ActivityEvent>;
                    return Object.values(data).reverse();
                }
            } catch (err) {
                console.warn("[proxy-store] getEvents RTDB error:", err);
            }
        }
        return getMemEvents(workspaceId).slice(0, limitCount);
    }

    // ── Summary & Risks ──────────────────────────────────────
    async getSummary(workspaceId: string = "default", period: "7d" | "30d" = "7d"): Promise<ActivitySummary> {
        const events = await this.getEvents(workspaceId, 200);
        return this.calculateSummaryFromEvents(events, period);
    }

    async getToolRisks(workspaceId: string = "default"): Promise<DynamicToolRisk[]> {
        const events = await this.getEvents(workspaceId, 200);
        return this.calculateToolRisksFromEvents(events);
    }

    // ── Alerts ────────────────────────────────────────────────
    async getAlerts(workspaceId: string = "default", limitCount = 20): Promise<ProxyAlert[]> {
        const db = getDb();
        if (db) {
            try {
                const path = `workspaces/${workspaceId}/${ALERTS_PATH}`;
                const snap = await db
                    .ref(path)
                    .orderByChild("timestamp")
                    .limitToLast(limitCount)
                    .get();
                if (snap.exists()) {
                    const data = snap.val() as Record<string, ProxyAlert>;
                    return Object.values(data).reverse();
                }
            } catch (err) {
                console.warn("[proxy-store] getAlerts RTDB error:", err);
            }
        }
        return getMemAlerts(workspaceId).slice(0, limitCount);
    }

    async addAlert(alert: ProxyAlert, workspaceId: string = "default"): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                const path = `workspaces/${workspaceId}/${ALERTS_PATH}/${alert.id}`;
                await db.ref(path).set(alert);
            } catch (err) {
                console.warn("[proxy-store] addAlert RTDB error:", err);
            }
        }
        const memAlerts = getMemAlerts(workspaceId);
        memAlerts.unshift(alert);
        setMemAlerts(workspaceId, memAlerts);
    }

    async acknowledgeAlert(alertId: string, workspaceId: string = "default"): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                const path = `workspaces/${workspaceId}/${ALERTS_PATH}/${alertId}/acknowledged`;
                await db.ref(path).set(true);
            } catch (err) {
                console.warn("[proxy-store] acknowledgeAlert RTDB error:", err);
            }
        }
        const alerts = getMemAlerts(workspaceId);
        const alert = alerts.find((a) => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            setMemAlerts(workspaceId, alerts);
        }
    }

    async getUnacknowledgedCount(workspaceId: string = "default"): Promise<number> {
        const alerts = await this.getAlerts(workspaceId, 100);
        return alerts.filter((a) => !a.acknowledged).length;
    }

    async getReportData(workspaceId: string = "default"): Promise<ProxyReportData> {
        const summary = await this.getSummary(workspaceId, "30d");
        const toolRisks = await this.getToolRisks(workspaceId);
        const settings = await this.getSettings(workspaceId);

        return {
            proxy_enabled: settings.proxy_enabled,
            total_requests_observed: summary.total_requests,
            pct_flagged_sensitive: summary.sensitive_prompt_pct,
            policy_violation_count: summary.total_violations,
            risk_concentration_by_tool: toolRisks.map(r => ({ tool: r.tool_name, pct: r.combined_risk_score })),
            comparison_vs_prior: null,
            recommended_policy_adjustments: [
                "Review critical risk prompts",
                "Enable blocking for PII if not enabled"
            ]
        };
    }

    // ── Internal Helpers ──────────────────────────────────────
    private calculateSummaryFromEvents(events: ActivityEvent[], period: string): ActivitySummary {
        const total = events.length;
        if (total === 0) return this.emptySummary();

        const violations = events.filter((e) => e.policy_violation_flag).length;
        const blocked = events.filter((e) => e.blocked).length;
        const sensitive = events.filter((e) => e.sensitivity_score > 0).length;
        const avgScore = events.reduce((sum, e) => sum + e.sensitivity_score, 0) / total;

        // ── Top Categories ──
        const catMap = new Map<string, number>();
        events.forEach(e => {
            if (e.sensitivity_categories) {
                e.sensitivity_categories.forEach(c => {
                    if (c && c !== "none") catMap.set(c, (catMap.get(c) || 0) + 1);
                });
            }
        });
        const top_risk_categories = Array.from(catMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // ── Top Tools ──
        const toolMap = new Map<string, { count: number, score: number }>();
        events.forEach(e => {
            const current = toolMap.get(e.tool) || { count: 0, score: 0 };
            toolMap.set(e.tool, {
                count: current.count + 1,
                score: current.score + e.sensitivity_score
            });
        });
        const total_tools = toolMap.size;
        const top_tools = Array.from(toolMap.entries())
            .map(([tool, data]) => ({
                tool,
                count: data.count,
                avg_sensitivity: Math.round(data.score / data.count)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // ── Risk Trend (Daily, Padded with zeros) ──
        const trendMap = new Map<string, { score: number, count: number }>();
        events.forEach(e => {
            const date = e.timestamp.split("T")[0];
            const current = trendMap.get(date) || { score: 0, count: 0 };
            trendMap.set(date, {
                score: current.score + e.sensitivity_score,
                count: current.count + 1
            });
        });

        // Pad with zeros for at least the last 7 or 30 days
        const risk_trend = [];
        const daysToPad = period === "30d" ? 30 : 7;
        const now = new Date();
        for (let i = daysToPad - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const data = trendMap.get(dateStr) || { score: 0, count: 0 };
            risk_trend.push({
                date: dateStr,
                score: data.count > 0 ? Math.round(data.score / data.count) : 0,
                requests: data.count
            });
        }

        return {
            total_requests: total,
            total_tools,
            total_violations: violations,
            total_blocked: blocked,
            sensitive_prompt_pct: Math.round((sensitive / total) * 100),
            avg_sensitivity_score: Math.round(avgScore),
            top_risk_categories,
            top_tools,
            risk_trend,
            activity_score: Math.round(avgScore * 1.5),
            period: period as "7d" | "30d",
        };
    }

    private calculateToolRisksFromEvents(events: ActivityEvent[]): DynamicToolRisk[] {
        const toolMap = new Map<string, ActivityEvent[]>();
        for (const e of events) {
            const arr = toolMap.get(e.tool) || [];
            arr.push(e);
            toolMap.set(e.tool, arr);
        }

        const risks: DynamicToolRisk[] = [];
        for (const [tool, toolEvents] of toolMap) {
            const avgScore =
                toolEvents.reduce((s, e) => s + e.sensitivity_score, 0) / toolEvents.length;
            risks.push({
                tool_name: tool,
                static_risk_tier: "low",
                dynamic_sensitivity_avg: Math.round(avgScore),
                policy_violation_count: toolEvents.filter((e) => e.policy_violation_flag).length,
                sensitive_prompt_volume: toolEvents.filter((e) => e.sensitivity_score > 0).length,
                high_risk_user_frequency: 0,
                total_requests: toolEvents.length,
                combined_risk_score: Math.round(avgScore),
                risk_escalated: avgScore > 50,
                governance_downgraded: false,
                last_activity_at: toolEvents[0]?.timestamp || new Date().toISOString()
            } as DynamicToolRisk);
        }
        return risks;
    }

    private emptySummary(): ActivitySummary {
        return {
            total_requests: 0,
            total_tools: 0,
            total_violations: 0,
            total_blocked: 0,
            sensitive_prompt_pct: 0,
            avg_sensitivity_score: 0,
            top_risk_categories: [],
            top_tools: [],
            risk_trend: [],
            activity_score: 0,
            period: "7d",
        };
    }

    private async checkThresholds(event: ActivityEvent, workspaceId: string) {
        if (event.risk_category === "critical") {
            const alert: ProxyAlert = {
                id: `alert_${Date.now()}`,
                type: "policy_violation",
                tool: event.tool,
                message: `Critical risk detected in ${event.tool}: ${event.sensitivity_categories.join(", ")}`,
                severity: "critical",
                timestamp: new Date().toISOString(),
                acknowledged: false,
                event_ref: event.id,
            };
            await this.addAlert(alert, workspaceId);
        }
    }
}

// Export singleton
const store = new ProxyStore();
export default store;
