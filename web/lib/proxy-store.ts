// Proxy Store — In-Memory for Local Development
// In production, this would use Firebase Admin SDK or a dedicated backend database.
// User authentication still flows through Firestore via the client-side auth-context.

import type {
    ProxySettings,
    ActivityEvent,
    ActivitySummary,
    DynamicToolRisk,
    ProxyAlert,
    ProxyReportData
} from "./proxy-types";

// Default settings
const DEFAULT_SETTINGS: ProxySettings = {
    proxy_enabled: false,
    full_audit_mode: false,
    block_high_risk: false,
    redact_sensitive: false,
    alert_on_violations: false,
    desktop_bypass: false,
    retention_days: 90,
    proxy_endpoint: "127.0.0.1:8080",
    updated_at: new Date().toISOString(),
};

// In-memory state (persists as long as the Next.js server is running)
// We use globalThis to ensure persistence across Next.js HMR/module reloads in dev
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

// Helper accessors
// Helper accessors
const _getSettings = () => globalStore._memSettings;
const _setSettings = (s: ProxySettings) => (globalStore._memSettings = s);
const _getEvents = () => globalStore._memEvents;
const _getAlerts = () => globalStore._memAlerts;

class ProxyStore {
    // ── Settings ─────────────────────────────────────────────────
    async getSettings(): Promise<ProxySettings> {
        return _getSettings();
    }

    async updateSettings(newSettings: Partial<ProxySettings>): Promise<ProxySettings> {
        const current = _getSettings();
        const updated = {
            ...current,
            ...newSettings,
            updated_at: new Date().toISOString(),
        };
        _setSettings(updated);
        return updated;
    }

    // ── Events ───────────────────────────────────────────────────
    async addEvent(event: ActivityEvent): Promise<void> {
        const events = _getEvents();
        events.unshift(event);
        if (events.length > 1000) events.pop();
        await this.checkThresholds(event);
    }

    async getEvents(limitCount = 50): Promise<ActivityEvent[]> {
        return _getEvents().slice(0, limitCount);
    }

    // ── Summary & Risks ──────────────────────────────────────────
    async getSummary(period: "7d" | "30d" = "7d"): Promise<ActivitySummary> {
        const events = await this.getEvents(200);
        return this.calculateSummaryFromEvents(events, period);
    }

    async getToolRisks(): Promise<DynamicToolRisk[]> {
        const events = await this.getEvents(200);
        return this.calculateToolRisksFromEvents(events);
    }

    // ── Alerts ────────────────────────────────────────────────────
    async getAlerts(limitCount = 20): Promise<ProxyAlert[]> {
        return _getAlerts().slice(0, limitCount);
    }

    async addAlert(alert: ProxyAlert): Promise<void> {
        _getAlerts().unshift(alert);
    }

    async acknowledgeAlert(alertId: string): Promise<void> {
        const alerts = _getAlerts();
        const alert = alerts.find((a) => a.id === alertId);
        if (alert) alert.acknowledged = true;
    }

    async getUnacknowledgedCount(): Promise<number> {
        const alerts = _getAlerts();
        return alerts.filter((a) => !a.acknowledged).length;
    }

    async getReportData(): Promise<ProxyReportData> {
        const summary = await this.getSummary("30d");
        const toolRisks = await this.getToolRisks();
        const settings = _getSettings();

        // Construct a full report object
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

    // ── Internal Helpers ──────────────────────────────────────────
    private calculateSummaryFromEvents(events: ActivityEvent[], period: string): ActivitySummary {
        const total = events.length;
        if (total === 0) return this.emptySummary();

        const violations = events.filter((e) => e.policy_violation_flag).length;
        const sensitive = events.filter((e) => e.sensitivity_score > 0).length;
        const avgScore = events.reduce((sum, e) => sum + e.sensitivity_score, 0) / total;

        return {
            total_requests: total,
            total_violations: violations,
            sensitive_prompt_pct: Math.round((sensitive / total) * 100),
            avg_sensitivity_score: Math.round(avgScore),
            top_risk_categories: [],
            top_tools: [],
            risk_trend: [],
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
                static_risk_tier: "low", // defaulting since we lack static definition here
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
            total_violations: 0,
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
