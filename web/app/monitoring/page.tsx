"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════
   Types (mirrors server types)
   ═══════════════════════════════════════════════════════════════ */

interface ActivitySummary {
    total_requests: number;
    total_violations: number;
    sensitive_prompt_pct: number;
    avg_sensitivity_score: number;
    top_risk_categories: { category: string; count: number }[];
    top_tools: { tool: string; count: number; avg_sensitivity: number }[];
    risk_trend: { date: string; score: number; requests: number }[];
    activity_score: number;
    period: "7d" | "30d";
}

interface ActivityEvent {
    id: string;
    tool: string;
    tool_domain: string;
    user_hash: string;
    sensitivity_score: number;
    sensitivity_categories: string[];
    policy_violation_flag: boolean;
    risk_category: string;
    timestamp: string;
    token_count_estimate: number;
    attachment_inspection_enabled?: boolean;
}

interface DynamicToolRisk {
    tool_name: string;
    dynamic_sensitivity_avg: number;
    policy_violation_count: number;
    sensitive_prompt_volume: number;
    high_risk_user_frequency: number;
    total_requests: number;
    combined_risk_score: number;
    risk_escalated: boolean;
    governance_downgraded: boolean;
}

interface ProxyAlert {
    id: string;
    type: string;
    tool: string;
    message: string;
    severity: string;
    timestamp: string;
    acknowledged: boolean;
}

interface ProxySettings {
    proxy_enabled: boolean;
    full_audit_mode: boolean;
    block_high_risk: boolean;
    redact_sensitive: boolean;
    alert_on_violations: boolean;
    retention_days: number;
    proxy_endpoint: string;
    agent_last_seen?: string;
    agent_hostname?: string;
    inspect_attachments: boolean;
}

interface AgentStatus {
    connected: boolean;
    last_seen: string | null;
    hostname: string | null;
    minutes_ago: number;
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function riskColor(category: string): string {
    switch (category?.toLowerCase()) {
        case "critical": return "text-red-600";
        case "high": return "text-orange-600";
        case "moderate": return "text-yellow-600";
        case "low": return "text-green-600";
        default: return "text-gray-600";
    }
}

function riskBg(category: string): string {
    switch (category?.toLowerCase()) {
        case "critical": return "bg-red-100 text-red-800";
        case "high": return "bg-orange-100 text-orange-800";
        case "moderate": return "bg-yellow-100 text-yellow-800";
        case "low": return "bg-green-100 text-green-800";
        default: return "bg-gray-100 text-gray-800";
    }
}

function categoryLabel(cat: string): string {
    const labels: Record<string, string> = {
        pii: "PII",
        financial: "Financial",
        source_code: "Source Code",
        phi: "PHI",
        trade_secret: "Trade Secret",
        internal_url: "Internal URL",
        none: "Clean",
    };
    return labels[cat] || cat;
}

function categoryColor(cat: string): string {
    const colors: Record<string, string> = {
        pii: "bg-red-100 text-red-700",
        financial: "bg-amber-100 text-amber-700",
        source_code: "bg-blue-100 text-blue-700",
        phi: "bg-purple-100 text-purple-700",
        trade_secret: "bg-rose-100 text-rose-700",
        internal_url: "bg-teal-100 text-teal-700",
        none: "bg-gray-100 text-gray-600",
    };
    return colors[cat] || "bg-gray-100 text-gray-600";
}

function formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function sensitivityBar(score: number): string {
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-400";
    if (score >= 25) return "bg-yellow-400";
    return "bg-green-400";
}

/* ═══════════════════════════════════════════════════════════════
   Score Ring Component
   ═══════════════════════════════════════════════════════════════ */

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    let color = "#16a34a";
    if (score >= 70) color = "#dc2626";
    else if (score >= 50) color = "#ea580c";
    else if (score >= 30) color = "#ca8a04";

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
            />
            <text
                x={size / 2}
                y={size / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="transform rotate-90 origin-center"
                fill={color}
                fontSize="24"
                fontWeight="bold"
            >
                {score}
            </text>
        </svg>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Mini Bar Chart
   ═══════════════════════════════════════════════════════════════ */

function MiniBarChart({
    data,
    maxVal,
}: {
    data: { label: string; value: number; color?: string }[];
    maxVal: number;
}) {
    return (
        <div className="space-y-2">
            {data.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-gray-600 truncate">{d.label}</span>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${d.color || "bg-brand-500"}`}
                            style={{ width: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%` }}
                        />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-8 text-right">
                        {d.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Trend Sparkline
   ═══════════════════════════════════════════════════════════════ */

function TrendSparkline({
    data,
}: {
    data: { date: string; score: number; requests: number }[];
}) {
    if (data.length < 2) return <p className="text-xs text-gray-400">Not enough data</p>;

    const maxScore = Math.max(...data.map((d) => d.score), 1);
    const maxReq = Math.max(...data.map((d) => d.requests), 1);
    const width = 320;
    const height = 80;

    const scorePath = data
        .map(
            (d, i) =>
                `${i === 0 ? "M" : "L"} ${(i / (data.length - 1)) * width} ${height - (d.score / maxScore) * (height - 8)
                }`
        )
        .join(" ");

    const reqPath = data
        .map(
            (d, i) =>
                `${i === 0 ? "M" : "L"} ${(i / (data.length - 1)) * width} ${height - (d.requests / maxReq) * (height - 8)
                }`
        )
        .join(" ");

    return (
        <div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
                <path d={reqPath} fill="none" stroke="#c7d2fe" strokeWidth="2" opacity="0.6" />
                <path d={scorePath} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
                {data.map((d, i) => (
                    <circle
                        key={d.date}
                        cx={(i / (data.length - 1)) * width}
                        cy={height - (d.score / maxScore) * (height - 8)}
                        r="3"
                        fill="#4f46e5"
                    />
                ))}
            </svg>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                <span>{data[0]?.date?.slice(5)}</span>
                <div className="flex gap-3">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-0.5 bg-brand-600 inline-block" /> Risk Score
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-0.5 bg-brand-200 inline-block" /> Requests
                    </span>
                </div>
                <span>{data[data.length - 1]?.date?.slice(5)}</span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Main Monitoring Page
   ═══════════════════════════════════════════════════════════════ */

export default function MonitoringPage() {
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState<ActivitySummary | null>(null);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [toolRisks, setToolRisks] = useState<DynamicToolRisk[]>([]);
    const [alerts, setAlerts] = useState<ProxyAlert[]>([]);
    const [settings, setSettings] = useState<ProxySettings | null>(null);
    const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
    const [period, setPeriod] = useState<"7d" | "30d">("7d");
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "events" | "tools" | "alerts">("overview");
    const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

    const fetchData = useCallback(async () => {
        if (authLoading) return; // Wait for auth to resolve before fetching

        try {
            const wsId = user?.uid || "default";
            const [activityRes, settingsRes, agentRes] = await Promise.all([
                fetch(`/api/proxy/activity?period=${period}&events=50&workspaceId=${wsId}`),
                fetch(`/api/proxy/settings?workspaceId=${wsId}`),
                fetch(`/api/agent/heartbeat?workspaceId=${wsId}`),
            ]);
            const activityData = await activityRes.json();
            const settingsData = await settingsRes.json();
            const agentData = await agentRes.json();

            setSummary(activityData.summary);
            setEvents(activityData.events);
            setToolRisks(activityData.tool_risks);
            setAlerts(activityData.alerts);
            setUnacknowledgedCount(activityData.unacknowledged_alerts);
            setSettings(settingsData);
            setAgentStatus(agentData);
        } catch (err) {
            console.error("Failed to fetch monitoring data:", err);
        } finally {
            setLoading(false);
        }
    }, [period, user?.uid, authLoading]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
            const interval = setInterval(fetchData, 15_000); // Refresh every 15s
            return () => clearInterval(interval);
        }
    }, [fetchData, authLoading]);

    async function acknowledgeAlert(alertId: string) {
        // Optimistic update
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
        try {
            await fetch("/api/proxy/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    alert_id: alertId,
                    action: "acknowledge",
                    workspaceId: user?.uid || "default"
                }),
            });
            fetchData();
        } catch (error) {
            console.error("Failed to acknowledge alert:", error);
            // Revert on failure
            fetchData();
        }
    }

    if (loading || (!summary && !agentStatus)) {
        return (
            <div className="flex items-center justify-center py-20 min-h-[60vh]">
                <div className="text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center mx-auto">
                        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-gray-100 border-t-brand-600" />
                    </div>
                    <p className="mt-4 text-sm text-gray-500 animate-pulse">Synchronizing security posture...</p>
                </div>
            </div>
        );
    }

    if (!agentStatus?.connected && events.length === 0) {
        return (
            <div className="mx-auto max-w-2xl py-12">
                <div className="card flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50 mb-6">
                        <svg className="h-10 w-10 text-brand-600 animate-pulse" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Waiting for Agent Connectivity</h3>
                    <p className="mt-2 text-sm text-gray-500 max-w-md px-6">
                        No active monitoring agents were found for this workspace.
                        Install the Complyze Agent on your machine to begin capturing AI activity.
                    </p>
                    <div className="mt-8 flex gap-3">
                        <Link href="/settings" className="btn-primary">
                            Deploy Agent
                        </Link>
                        <button onClick={fetchData} className="btn-secondary">
                            Check Again
                        </button>
                    </div>
                    <div className="mt-8 pt-8 border-t border-gray-100 w-full max-w-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Quick Manual Setup</p>
                        <code className="block p-3 bg-gray-50 rounded text-[11px] font-mono text-gray-600 text-left overflow-x-auto">
                            curl -fsSL https://web-one-beta-35.vercel.app/api/agent/installer | bash
                        </code>
                    </div>
                </div>
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-white/90">
                            AI Proxy Monitoring
                        </h1>
                        {agentStatus?.connected ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800 shadow-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                LIVE · {agentStatus.hostname}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                OFFLINE
                            </span>
                        )}
                        {settings?.inspect_attachments && agentStatus?.connected && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 shadow-sm border border-indigo-200">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.5L8.25 18.75a1.5 1.5 0 11-2.12-2.12L15.75 7.5" />
                                </svg>
                                ATTACHMENT INSPECTION ACTIVE
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-white/60">
                        Real-time AI usage intelligence. Activity-informed risk scoring.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Period Toggle */}
                    <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                        <button
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${period === "7d"
                                ? "bg-brand-600 text-white"
                                : "text-gray-600 hover:bg-gray-50"
                                }`}
                            onClick={() => setPeriod("7d")}
                        >
                            7 Days
                        </button>
                        <button
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${period === "30d"
                                ? "bg-brand-600 text-white"
                                : "text-gray-600 hover:bg-gray-50"
                                }`}
                            onClick={() => setPeriod("30d")}
                        >
                            30 Days
                        </button>
                    </div>
                    <Link href="/settings" className="btn-secondary text-xs py-2">
                        ⚙ Settings
                    </Link>
                </div>
            </div>

            {/* ── Tab Navigation ── */}
            <div className="flex gap-1 border-b border-gray-200 pb-0">
                {(
                    [
                        { key: "overview", label: "Overview" },
                        { key: "events", label: "Activity Log" },
                        { key: "tools", label: "Tool Risk" },
                        { key: "alerts", label: `Alerts${unacknowledgedCount > 0 ? ` (${unacknowledgedCount})` : ""}` },
                    ] as const
                ).map((tab) => (
                    <button
                        key={tab.key}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                            ? "border-brand-600 text-brand-700"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                            }`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ═══════════ OVERVIEW TAB ═══════════ */}
            {
                activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* ── Stats Row ── */}
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                            <div className="card flex flex-col items-center gap-1 py-5">
                                <span className="text-3xl font-bold text-brand-600">{summary.total_requests}</span>
                                <span className="text-xs text-gray-500">Total Requests</span>
                            </div>
                            <div className="card flex flex-col items-center gap-1 py-5">
                                <span className="text-3xl font-bold text-red-600">{summary.total_violations}</span>
                                <span className="text-xs text-gray-500">Policy Violations</span>
                            </div>
                            <div className="card flex flex-col items-center gap-1 py-5">
                                <span className="text-3xl font-bold text-orange-600">{summary.sensitive_prompt_pct}%</span>
                                <span className="text-xs text-gray-500">Sensitive Prompts</span>
                            </div>
                            <div className="card flex flex-col items-center gap-1 py-5">
                                <span className="text-3xl font-bold text-yellow-600">{summary.avg_sensitivity_score}</span>
                                <span className="text-xs text-gray-500">Avg Sensitivity</span>
                            </div>
                            <div className="card flex flex-col items-center gap-1 py-5 border-brand-200 bg-brand-50/30">
                                <span className="text-3xl font-bold text-brand-700">{summary.activity_score}</span>
                                <span className="text-xs text-brand-600 font-semibold">Activity Risk Score</span>
                            </div>
                        </div>

                        {/* ── Activity-Informed Risk Badge ── */}
                        <div className="card border-brand-200 bg-gradient-to-r from-brand-50 to-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <ScoreRing score={summary.activity_score} size={90} />
                                    <div>
                                        <p className="text-sm font-bold text-brand-800">Activity-Informed Risk Score</p>
                                        <p className="text-xs text-brand-600 mt-0.5">
                                            Blended static tool risk + dynamic observed behavior
                                        </p>
                                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303" />
                                            </svg>
                                            Risk Score Based on Live Usage
                                        </div>
                                    </div>
                                </div>
                                <div className="hidden sm:block text-right">
                                    <p className="text-xs text-gray-500">Period: {period === "7d" ? "Last 7 Days" : "Last 30 Days"}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {summary.total_requests} requests analyzed
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── Charts Row ── */}
                        <div className="grid gap-6 lg:grid-cols-2">
                            {/* Risk Trend */}
                            <div className="card">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4">Risk Trend Over Time</h3>
                                <TrendSparkline data={summary.risk_trend} />
                            </div>

                            {/* Top Risk Categories */}
                            <div className="card">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Risk Categories</h3>
                                <MiniBarChart
                                    data={summary.top_risk_categories.map((c) => ({
                                        label: categoryLabel(c.category),
                                        value: c.count,
                                        color: c.category === "pii" || c.category === "phi"
                                            ? "bg-red-400"
                                            : c.category === "financial" || c.category === "trade_secret"
                                                ? "bg-orange-400"
                                                : "bg-brand-400",
                                    }))}
                                    maxVal={Math.max(...summary.top_risk_categories.map((c) => c.count), 1)}
                                />
                            </div>
                        </div>

                        {/* ── Most Used Tools ── */}
                        <div className="card">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">Most Frequently Used AI Tools</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            <th className="pb-2 pr-4">Tool</th>
                                            <th className="pb-2 pr-4">Requests</th>
                                            <th className="pb-2 pr-4">Avg Sensitivity</th>
                                            <th className="pb-2">Risk Level</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {summary.top_tools.map((t) => {
                                            const risk =
                                                t.avg_sensitivity >= 60 ? "high" :
                                                    t.avg_sensitivity >= 30 ? "moderate" : "low";
                                            return (
                                                <tr key={t.tool}>
                                                    <td className="py-3 pr-4 font-medium text-gray-900">{t.tool}</td>
                                                    <td className="py-3 pr-4 text-gray-600">{t.count}</td>
                                                    <td className="py-3 pr-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${sensitivityBar(t.avg_sensitivity)}`}
                                                                    style={{ width: `${t.avg_sensitivity}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs text-gray-500">{t.avg_sensitivity}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3">
                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${riskBg(risk)}`}>
                                                            {risk}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ═══════════ EVENTS TAB ═══════════ */}
            {
                activeTab === "events" && (
                    <div className="card p-0 overflow-hidden">
                        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">
                                Recent Activity ({events.length})
                            </h3>
                            <span className="text-xs text-gray-400">Auto-refreshes every 15s</span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                            {events.map((e) => (
                                <div
                                    key={e.id}
                                    className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors ${e.policy_violation_flag ? "border-l-4 border-l-red-400" : ""
                                        }`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="flex flex-col items-center">
                                            <div
                                                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${e.sensitivity_score >= 60 ? "bg-red-500" :
                                                    e.sensitivity_score >= 30 ? "bg-orange-400" :
                                                        "bg-green-500"
                                                    }`}
                                            >
                                                {e.sensitivity_score}
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-900 text-sm truncate">{e.tool}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                {e.sensitivity_categories
                                                    .filter((c) => c !== "none")
                                                    .map((cat) => (
                                                        <span key={cat} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${categoryColor(cat)}`}>
                                                            {categoryLabel(cat)}
                                                        </span>
                                                    ))}
                                                {e.sensitivity_categories.includes("none") && (
                                                    <span className="text-[10px] text-gray-400">Clean</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-right shrink-0">
                                        <div>
                                            <p className="text-xs text-gray-500">{e.user_hash}</p>
                                            <p className="text-[10px] text-gray-400">{e.token_count_estimate} tokens</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">{formatTime(e.timestamp)}</p>
                                            {e.policy_violation_flag && (
                                                <span className="text-[10px] font-bold text-red-600 block">⚠ VIOLATION</span>
                                            )}
                                            {e.attachment_inspection_enabled !== undefined && (
                                                <span className={`text-[9px] font-medium uppercase px-1 rounded ${e.attachment_inspection_enabled ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>
                                                    Files: {e.attachment_inspection_enabled ? "Inspected" : "Bypassed"}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* ═══════════ TOOLS TAB ═══════════ */}
            {
                activeTab === "tools" && (
                    <div className="space-y-4">
                        {toolRisks.map((t) => (
                            <div
                                key={t.tool_name}
                                className={`card ${t.risk_escalated ? "border-red-200 bg-red-50/30" :
                                    t.governance_downgraded ? "border-orange-200 bg-orange-50/30" : ""
                                    }`}
                            >
                                <div className="flex items-center justify-between flex-wrap gap-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900">{t.tool_name}</h3>
                                            {t.risk_escalated && (
                                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                                    ESCALATED
                                                </span>
                                            )}
                                            {t.governance_downgraded && (
                                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                                                    DOWNGRADED
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {t.total_requests} requests · {t.policy_violation_count} violations ·{" "}
                                            {t.high_risk_user_frequency} high-risk users
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-center">
                                            <p className={`text-2xl font-bold ${riskColor(
                                                t.combined_risk_score >= 70 ? "critical" :
                                                    t.combined_risk_score >= 50 ? "high" :
                                                        t.combined_risk_score >= 30 ? "moderate" : "low"
                                            )}`}>
                                                {t.combined_risk_score}
                                            </p>
                                            <p className="text-[10px] text-gray-400">Combined Score</p>
                                        </div>
                                        <div className="w-24 h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${sensitivityBar(t.combined_risk_score)}`}
                                                style={{ width: `${t.combined_risk_score}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Tool Breakdown */}
                                <div className="mt-4 grid grid-cols-4 gap-4 border-t border-gray-100 pt-3">
                                    <div>
                                        <p className="text-xs text-gray-500">Sensitivity Avg</p>
                                        <p className="text-sm font-semibold">{t.dynamic_sensitivity_avg}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Violations</p>
                                        <p className={`text-sm font-semibold ${t.policy_violation_count > 5 ? "text-red-600" : ""}`}>
                                            {t.policy_violation_count}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Sensitive Prompts</p>
                                        <p className="text-sm font-semibold">{t.sensitive_prompt_volume}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">High-Risk Users</p>
                                        <p className="text-sm font-semibold">{t.high_risk_user_frequency}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            {/* ═══════════ ALERTS TAB ═══════════ */}
            {
                activeTab === "alerts" && (
                    <div className="space-y-3">
                        {alerts.length === 0 ? (
                            <div className="card text-center py-12">
                                <p className="text-gray-500">No alerts generated yet.</p>
                            </div>
                        ) : (
                            alerts.map((a) => (
                                <div
                                    key={a.id}
                                    className={`card flex items-start justify-between gap-4 ${a.acknowledged ? "opacity-60" : ""
                                        } ${a.severity === "critical" ? "border-l-4 border-l-red-500" :
                                            a.severity === "high" ? "border-l-4 border-l-orange-400" :
                                                a.severity === "moderate" ? "border-l-4 border-l-yellow-400" :
                                                    "border-l-4 border-l-green-400"
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${riskBg(a.severity)}`}>
                                                {a.severity}
                                            </span>
                                            <span className="text-xs text-gray-400">{a.tool}</span>
                                            <span className="text-xs text-gray-300">{formatTime(a.timestamp)}</span>
                                        </div>
                                        <p className="mt-1.5 text-sm text-gray-800">{a.message}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!a.acknowledged ? (
                                            <button
                                                onClick={() => acknowledgeAlert(a.id)}
                                                className="shrink-0 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-1.5 active:scale-95"
                                            >
                                                <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                                Acknowledge
                                            </button>
                                        ) : (
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Resolved
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )
            }
        </div>
    );
}
