/**
 * Complyze — AI Proxy Monitoring Mode Types
 *
 * Core type definitions for the proxy monitoring, classification,
 * and risk engine integration layer.
 */

/* ── Proxy Settings ── */

export interface ProxySettings {
    proxy_enabled: boolean;
    full_audit_mode: boolean;         // store full prompts
    block_high_risk: boolean;         // block high-risk prompts
    risk_threshold: number;           // sensitivity score (0-100) above which blocking triggers
    redact_sensitive: boolean;        // redact PII before forwarding
    alert_on_violations: boolean;     // alert admin on policy violations
    desktop_bypass: boolean;          // allow cert-pinned desktop apps (metadata only)
    retention_days: number;           // configurable retention period
    proxy_endpoint: string;           // generated endpoint URL
    inspect_attachments: boolean;     // NEW: Deep scan file uploads
    updated_at: string;
}

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
    proxy_enabled: false,
    full_audit_mode: false,
    block_high_risk: false,
    risk_threshold: 60,               // default: block at score >= 60 (balanced posture)
    redact_sensitive: false,
    alert_on_violations: true,
    desktop_bypass: false,            // default: deep inspect everything
    retention_days: 90,
    proxy_endpoint: "",
    inspect_attachments: false,       // default: OFF
    updated_at: new Date().toISOString(),
};

/* ── Sensitivity Classification ── */

export type SensitivityCategory =
    | "pii"
    | "financial"
    | "source_code"
    | "phi"
    | "trade_secret"
    | "internal_url"
    | "none";

export interface ClassificationResult {
    categories_detected: SensitivityCategory[];
    sensitivity_score: number;        // 0–100
    policy_violation_flag: boolean;
    risk_category: string;            // "critical" | "high" | "moderate" | "low"
    details: string[];                // human-readable findings
}

/* ── Activity Event ── */

export interface ActivityEvent {
    id: string;
    tool: string;
    tool_domain: string;
    user_hash: string;
    prompt_hash: string;
    prompt_length: number;
    token_count_estimate: number;
    api_endpoint: string;
    sensitivity_score: number;
    sensitivity_categories: SensitivityCategory[];
    policy_violation_flag: boolean;
    risk_category: string;
    timestamp: string;
    blocked?: boolean; // tracking enforcement action
    // Only present when full_audit_mode is enabled
    full_prompt?: string;
    attachment_inspection_enabled?: boolean;
}

/* ── Activity Summary (Dashboard) ── */

export interface ActivitySummary {
    total_requests: number;
    total_tools: number;
    total_violations: number;
    total_blocked: number;
    sensitive_prompt_pct: number;     // % containing sensitive markers
    avg_sensitivity_score: number;
    top_risk_categories: { category: string; count: number }[];
    top_tools: { tool: string; count: number; avg_sensitivity: number }[];
    risk_trend: { date: string; score: number; requests: number }[];
    activity_score: number;           // "Activity-Informed Risk Score"
    period: "7d" | "30d";
}

/* ── Tool-Level Dynamic Risk ── */

export interface DynamicToolRisk {
    tool_name: string;
    static_risk_tier: string;
    dynamic_sensitivity_avg: number;
    policy_violation_count: number;
    sensitive_prompt_volume: number;
    high_risk_user_frequency: number;
    total_requests: number;
    combined_risk_score: number;      // blended static + dynamic
    risk_escalated: boolean;
    governance_downgraded: boolean;
    last_activity_at: string;
}

/* ── Alert ── */

export interface ProxyAlert {
    id: string;
    type: "risk_escalation" | "governance_downgrade" | "policy_violation" | "threshold_exceeded";
    tool: string;
    message: string;
    severity: "critical" | "high" | "moderate" | "low";
    timestamp: string;
    acknowledged: boolean;
    event_ref?: string;
}

/* ── Proxy Request (incoming to proxy) ── */

export interface ProxyRequest {
    target_url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    user_id?: string;
}

/* ── Report Enhancement Data ── */

export interface ProxyReportData {
    proxy_enabled: boolean;
    total_requests_observed: number;
    pct_flagged_sensitive: number;
    policy_violation_count: number;
    risk_concentration_by_tool: { tool: string; pct: number }[];
    comparison_vs_prior: {
        requests_change_pct: number;
        violations_change_pct: number;
        sensitivity_change_pct: number;
    } | null;
    recommended_policy_adjustments: string[];
}

/* ── Agent Registration & Status ── */

export type AgentStatus = "Healthy" | "Offline" | "Outdated" | "Connecting";

export interface AgentRegistration {
    device_id: string;
    hostname: string;
    os: "macOS" | "Windows";
    version: string;
    status: AgentStatus;
    last_sync: string;
    heartbeat_interval: number; // seconds
    workspace_id: string;
    service_connectivity: boolean;
    traffic_routing: boolean;
    os_integration: boolean;
}

export interface InstallationLog {
    user_id: string;
    timestamp: string;
    os_type: string;
    version: string;
    status: "download_initiated" | "installed" | "registered";
}

/* ── Asset Tool (from manual registration or discovery) ── */

export interface AssetTool {
    id: string;
    tool_name: string;
    vendor: string;
    category: string;
    deployment_type: string;
    owner: string;
    risk_tier: "critical" | "high" | "moderate" | "low";
    governance_status: "assessed" | "unassessed" | "pending";
    scanned_at: string;
    notes?: string;
    flag_count: number;
    rec_count: number;
}
