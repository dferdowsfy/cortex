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

// ── In-memory fallback (for when RTDB is unavailable) ────────
const globalStore = globalThis as unknown as {
    _memSettings: ProxySettings;
    _memEvents: ActivityEvent[];
    _memAlerts: ProxyAlert[];
};

if (!globalStore._memSettings) {
    globalStore._memSettings = { ...DEFAULT_SETTINGS };
    globalStore._memEvents = [];
    globalStore._memAlerts = [];
}

// ── RTDB paths ───────────────────────────────────────────────
const SETTINGS_PATH = "proxy_config/settings";
const EVENTS_PATH = "proxy_events";
const ALERTS_PATH = "proxy_alerts";

class ProxyStore {
    // ── Settings ─────────────────────────────────────────────
    async getSettings(): Promise<ProxySettings> {
        const db = getDb();
        if (!db) return globalStore._memSettings;

        try {
            const snap = await db.ref(SETTINGS_PATH).get();
            if (snap.exists()) {
                return snap.val() as ProxySettings;
            }
            // No settings yet — create with defaults
            await db.ref(SETTINGS_PATH).set(DEFAULT_SETTINGS);
            return { ...DEFAULT_SETTINGS };
        } catch (err) {
            console.warn("[proxy-store] getSettings RTDB error, using memory:", err);
            return globalStore._memSettings;
        }
    }

    async updateSettings(newSettings: Partial<ProxySettings>): Promise<ProxySettings> {
        const current = await this.getSettings();
        const updated: ProxySettings = {
            ...current,
            ...newSettings,
            updated_at: new Date().toISOString(),
        };

        const db = getDb();
        if (db) {
            try {
                await db.ref(SETTINGS_PATH).set(updated);
            } catch (err) {
                console.warn("[proxy-store] updateSettings RTDB error:", err);
            }
        }

        globalStore._memSettings = updated;
        return updated;
    }

    // ── Events ───────────────────────────────────────────────
    async addEvent(event: ActivityEvent): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                await db.ref(`${EVENTS_PATH}/${event.id}`).set({
                    ...event,
                    _created_at: new Date().toISOString(),
                });
            } catch (err) {
                console.warn("[proxy-store] addEvent RTDB error:", err);
            }
        }

        globalStore._memEvents.unshift(event);
        if (globalStore._memEvents.length > 1000) globalStore._memEvents.pop();

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

        await this.checkThresholds(event);
    }

    async getEvents(limitCount = 50): Promise<ActivityEvent[]> {
        const db = getDb();
        if (db) {
            try {
                const snap = await db
                    .ref(EVENTS_PATH)
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
        return globalStore._memEvents.slice(0, limitCount);
    }

    // ── Summary & Risks ──────────────────────────────────────
    async getSummary(period: "7d" | "30d" = "7d"): Promise<ActivitySummary> {
        const events = await this.getEvents(200);
        return this.calculateSummaryFromEvents(events, period);
    }

    async getToolRisks(): Promise<DynamicToolRisk[]> {
        const events = await this.getEvents(200);
        return this.calculateToolRisksFromEvents(events);
    }

    // ── Alerts ────────────────────────────────────────────────
    async getAlerts(limitCount = 20): Promise<ProxyAlert[]> {
        const db = getDb();
        if (db) {
            try {
                const snap = await db
                    .ref(ALERTS_PATH)
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
        return globalStore._memAlerts.slice(0, limitCount);
    }

    async addAlert(alert: ProxyAlert): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                await db.ref(`${ALERTS_PATH}/${alert.id}`).set(alert);
            } catch (err) {
                console.warn("[proxy-store] addAlert RTDB error:", err);
            }
        }
        globalStore._memAlerts.unshift(alert);
    }

    async acknowledgeAlert(alertId: string): Promise<void> {
        const db = getDb();
        if (db) {
            try {
                await db.ref(`${ALERTS_PATH}/${alertId}/acknowledged`).set(true);
            } catch (err) {
                console.warn("[proxy-store] acknowledgeAlert RTDB error:", err);
            }
        }
        const alerts = globalStore._memAlerts;
        const alert = alerts.find((a) => a.id === alertId);
        if (alert) alert.acknowledged = true;
    }

    async getUnacknowledgedCount(): Promise<number> {
        const alerts = await this.getAlerts(100);
        return alerts.filter((a) => !a.acknowledged).length;
    }

    async getReportData(): Promise<ProxyReportData> {
        const summary = await this.getSummary("30d");
        const toolRisks = await this.getToolRisks();
        const settings = await this.getSettings();

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
            e.sensitivity_categories.forEach(c => {
                if (c !== "none") catMap.set(c, (catMap.get(c) || 0) + 1);
            });
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

        // ── Risk Trend (Daily) ──
        const trendMap = new Map<string, { score: number, count: number }>();
        events.forEach(e => {
            const date = e.timestamp.split("T")[0];
            const current = trendMap.get(date) || { score: 0, count: 0 };
            trendMap.set(date, {
                score: current.score + e.sensitivity_score,
                count: current.count + 1
            });
        });
        const risk_trend = Array.from(trendMap.entries())
            .map(([date, data]) => ({
                date,
                score: Math.round(data.score / data.count),
                requests: data.count
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

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

    private async checkThresholds(event: ActivityEvent) {
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
            await this.addAlert(alert);
        }
    }
}

// Export singleton
const store = new ProxyStore();
export default store;
