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

interface Agent {
    device_id: string;
    device_name?: string;
    hostname: string;
    os_type: string;
    agent_version: string;
    last_sync: string;
    status: string;
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

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function riskColor(category: string): string {
    switch (category?.toLowerCase()) {
        case "critical": return "text-red-500";
        case "high": return "text-orange-500";
        case "moderate": return "text-yellow-500";
        case "low": return "text-emerald-500";
        default: return "text-white/40";
    }
}

function riskBg(category: string): string {
    switch (category?.toLowerCase()) {
        case "critical": return "bg-red-500/10 text-red-400 border border-red-500/20";
        case "high": return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
        case "moderate": return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
        case "low": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
        default: return "bg-zinc-900 text-white/40";
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
        pii: "bg-red-500/10 text-red-300 border border-red-500/20",
        financial: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
        source_code: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
        phi: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
        trade_secret: "bg-rose-500/10 text-rose-300 border border-rose-500/20",
        internal_url: "bg-teal-500/10 text-teal-300 border border-teal-500/20",
        none: "bg-white/5 text-white/30",
    };
    return colors[cat] || "bg-white/5 text-white/30";
}

function sensitivityBar(score: number): string {
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-emerald-500";
}

/* ═══════════════════════════════════════════════════════════════
   Score Ring Component
   ═══════════════════════════════════════════════════════════════ */

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
    const radius = (size - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    let color = "#10b981";
    if (score >= 70) color = "#ef4444";
    else if (score >= 50) color = "#f59e0b";
    else if (score >= 30) color = "#eab308";

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="6"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="6"
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
                fontSize="22"
                fontWeight="900"
            >
                {score}
            </text>
        </svg>
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
    const [agents, setAgents] = useState<Agent[]>([]);
    const [period, setPeriod] = useState<"7d" | "30d">("7d");
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "events" | "tools" | "alerts">("overview");

    const fetchData = useCallback(async () => {
        if (authLoading) return;

        try {
            const wsId = user?.uid || "default";
            const [activityRes, agentRes] = await Promise.all([
                fetch(`/api/proxy/activity?period=${period}&events=50&workspaceId=${wsId}`),
                fetch(`/api/agent/heartbeat?workspaceId=${wsId}`),
            ]);

            const activityData = await activityRes.json();
            const agentData = await agentRes.json();

            setSummary(activityData.summary);
            setEvents(activityData.events);
            setToolRisks(activityData.tool_risks);
            setAlerts(activityData.alerts);
            setAgents(agentData.agents || []);
        } catch (err) {
            console.error("Failed to fetch monitoring data:", err);
        } finally {
            setLoading(false);
        }
    }, [period, user?.uid, authLoading]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
            const interval = setInterval(fetchData, 5000); // 5s SILENT AUTO-REFRESH
            return () => clearInterval(interval);
        }
    }, [fetchData, authLoading]);

    async function acknowledgeAlert(alertId: string) {
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
            fetchData();
        }
    }

    if (loading || (!summary && agents.length === 0)) {
        return (
            <div className="flex items-center justify-center py-20 min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/20 mx-auto mb-4" />
                    <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-black">Syncing Telemetry...</p>
                </div>
            </div>
        );
    }

    /* ── Minimal Empty State ── */
    if (agents.length === 0 && events.length === 0) {
        return (
            <div className="mx-auto max-w-2xl py-24 flex flex-col items-center text-center">
                <h3 className="text-2xl font-black text-white/90 tracking-tight">No active devices enrolled.</h3>
                <p className="mt-3 text-sm text-white/40 max-w-sm leading-relaxed">
                    Captured real-time AI usage data requires at least one monitoring agent to be active on your endpoint infrastructure.
                </p>
                <div className="mt-10 flex items-center gap-6">
                    <Link href="/governance" className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-black text-xs transition-all uppercase tracking-widest shadow-xl shadow-blue-900/20">
                        Enroll Device
                    </Link>
                    <Link href="https://docs.complyze.ai" className="text-white/40 hover:text-white/70 text-xs font-bold uppercase tracking-widest underline transition-colors">
                        View Installation Guide
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-10 max-w-7xl mx-auto px-6">
            {/* ── Header ── */}
            <div className="flex items-end justify-between border-b border-white/5 pb-8">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tighter">Monitoring</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-[0.2em]">Operational Pulse Active (5s)</span>
                    </div>
                </div>
                <div className="flex rounded-lg border border-white/5 bg-white/[0.02] p-0.5 shadow-inner">
                    <button
                        className={`rounded-md px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${period === "7d" ? "bg-white/10 text-white shadow-lg" : "text-white/30 hover:text-white/50"}`}
                        onClick={() => setPeriod("7d")}
                    >
                        7 Days
                    </button>
                    <button
                        className={`rounded-md px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${period === "30d" ? "bg-white/10 text-white shadow-lg" : "text-white/30 hover:text-white/50"}`}
                        onClick={() => setPeriod("30d")}
                    >
                        30 Days
                    </button>
                </div>
            </div>

            {/* ── Device Constellation ── */}
            <section className="bg-white/[0.01] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 bg-white/[0.01] border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Active Device Constellation</h3>
                </div>
                <div className="overflow-x-auto overflow-y-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] border-b border-white/5">
                                <th className="px-6 py-4">Node Identity</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Last Pulse</th>
                                <th className="px-6 py-4">Agent vX</th>
                                <th className="px-6 py-4">24h Risk Signals</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {agents.map((agent) => (
                                <tr key={agent.device_id} className="hover:bg-white/[0.01] transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-black text-white/80 text-sm tracking-tight">{agent.device_name || agent.hostname}</span>
                                            <span className="text-[9px] text-white/20 font-mono uppercase tracking-tighter">{agent.device_id.substring(0, 16)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${agent.status === 'Healthy' ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.05)]' : 'bg-red-500/5 text-red-500 border border-red-500/10'}`}>
                                            <span className={`w-1 h-1 rounded-full ${agent.status === 'Healthy' ? 'bg-emerald-400' : 'bg-red-500'}`} />
                                            {agent.status === 'Healthy' ? 'ONLINE' : 'OFFLINE'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-white/40">
                                        {new Date(agent.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-white/5 px-2.5 py-1 rounded text-[9px] font-black text-blue-400/80 border border-blue-500/10 uppercase font-mono">v{agent.agent_version || '1.0.0'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-black text-white/60 tabular-nums">0</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── Operational Intelligence Tabs ── */}
            <div className="space-y-6">
                <div className="flex gap-4 border-b border-white/5 pb-0 overflow-x-auto">
                    {(
                        [
                            { key: "overview", label: "Overview Intelligence" },
                            { key: "events", label: "Real-time Activity" },
                            { key: "tools", label: "Dynamic Risk Profile" },
                            { key: "alerts", label: "System Alerts" },
                        ] as const
                    ).map((tab) => (
                        <button
                            key={tab.key}
                            className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === tab.key
                                ? "border-white/90 text-white"
                                : "border-transparent text-white/30 hover:text-white/50"
                                }`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* OVERVIEW TAB */}
                {activeTab === "overview" && summary && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            {[
                                { label: "Total Observed", val: summary.total_requests, cls: "text-zinc-100" },
                                { label: "Policy Violations", val: summary.total_violations, cls: "text-red-500" },
                                { label: "Sensitive Prompts", val: `${summary.sensitive_prompt_pct}%`, cls: "text-amber-500" },
                                { label: "Risk Score", val: summary.activity_score, cls: "text-white" }
                            ].map((card) => (
                                <div key={card.label} className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex flex-col gap-2">
                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">{card.label}</span>
                                    <span className={`text-3xl font-black ${card.cls}`}>{card.val}</span>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-8 flex items-center justify-between">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Composite Risk Posture</h3>
                                    <p className="text-sm font-bold text-white/60 leading-relaxed max-w-xs uppercase tracking-tight italic">
                                        Dynamic assessment based on real-time behavior and tool classification.
                                    </p>
                                </div>
                                <ScoreRing score={summary.activity_score} size={110} />
                            </div>

                            <div className="bg-white/[0.01] border border-white/10 rounded-2xl p-8">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-6">Top Risk Flux</h3>
                                <div className="space-y-4">
                                    {summary.top_risk_categories.map((c) => (
                                        <div key={c.category} className="flex items-center gap-4">
                                            <span className="text-[10px] font-black text-white/40 uppercase w-24 tracking-widest">{categoryLabel(c.category)}</span>
                                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className={`h-full ${riskColor(c.category === 'pii' ? 'critical' : 'high')}`} style={{ width: `${Math.min(100, (c.count / summary.total_requests) * 500)}%`, backgroundColor: 'currentColor' }} />
                                            </div>
                                            <span className="text-xs font-black text-white/70 tabular-nums">{c.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/[0.01] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                            <div className="px-8 py-5 border-b border-white/5 bg-white/[0.01]">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Most Frequent AI Traffic</h3>
                            </div>
                            <table className="w-full text-left">
                                <thead className="text-[9px] font-black text-white/20 uppercase tracking-widest border-b border-white/5">
                                    <tr>
                                        <th className="px-8 py-4">Tool Intelligence</th>
                                        <th className="px-8 py-4">Vol</th>
                                        <th className="px-8 py-4">Sensitivity Impact</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {summary.top_tools.map((t) => (
                                        <tr key={t.tool} className="text-sm">
                                            <td className="px-8 py-4 font-black text-white/80">{t.tool}</td>
                                            <td className="px-8 py-4 font-bold text-white/40 tabular-nums">{t.count}</td>
                                            <td className="px-8 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div className={`h-full ${sensitivityBar(t.avg_sensitivity)}`} style={{ width: `${t.avg_sensitivity}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-white/40 tabular-nums">{t.avg_sensitivity}/100</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ACTIVITY LOG TAB */}
                {activeTab === "events" && (
                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-500">
                        <div className="px-8 py-5 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Streaming Activity Log</h3>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest tabular-nums">{events.length} logs cached</span>
                        </div>
                        <div className="divide-y divide-white/[0.03] max-h-[600px] overflow-y-auto custom-scrollbar">
                            {events.map((e) => (
                                <div key={e.id} className="px-8 py-5 hover:bg-white/[0.01] transition-all flex items-center justify-between group">
                                    <div className="flex items-center gap-6">
                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-lg transition-transform group-hover:scale-110 ${e.sensitivity_score >= 60 ? "bg-red-500" : e.sensitivity_score >= 30 ? "bg-amber-500" : "bg-emerald-500"}`}>
                                            {e.sensitivity_score}
                                        </div>
                                        <div>
                                            <p className="font-black text-white/90 text-sm tracking-tight">{e.tool}</p>
                                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                <span className="text-[9px] font-black text-white/30 uppercase font-mono tracking-widest">{e.user_hash}</span>
                                                {e.sensitivity_categories.filter(c => c !== 'none').map(cat => (
                                                    <span key={cat} className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter ${categoryColor(cat)}`}>
                                                        {categoryLabel(cat)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.1em]">{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
                                        {e.policy_violation_flag && (
                                            <span className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-1 block">Policy Violation</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* DYNAMIC RISK PROFILE TAB */}
                {activeTab === "tools" && (
                    <div className="grid gap-6 animate-in fade-in duration-500">
                        {toolRisks.map((t) => (
                            <div key={t.tool_name} className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:bg-white/[0.03] transition-all">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-lg font-black text-white/90 tracking-tight">{t.tool_name}</h3>
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mt-1">
                                            {t.total_requests} Observed Instances · {t.policy_violation_count} Critical findings
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-4xl font-black ${riskColor(t.combined_risk_score >= 70 ? 'critical' : t.combined_risk_score >= 40 ? 'high' : 'low')}`}>
                                            {t.combined_risk_score}
                                        </span>
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-1">Risk Bias</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pt-6 border-t border-white/5">
                                    {[
                                        { label: "Sensitivity Avg", val: t.dynamic_sensitivity_avg },
                                        { label: "Policy Collisions", val: t.policy_violation_count },
                                        { label: "Sensitive Vol", val: t.sensitive_prompt_volume },
                                        { label: "Exposure Profile", val: t.risk_escalated ? "ESCALATED" : "STABLE" }
                                    ].map(metric => (
                                        <div key={metric.label}>
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">{metric.label}</p>
                                            <p className="text-sm font-black text-white/70">{metric.val}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* SYSTEM ALERTS TAB */}
                {activeTab === "alerts" && (
                    <div className="space-y-4 animate-in slide-in-from-right-2 duration-500">
                        {alerts.length === 0 ? (
                            <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-20 text-center">
                                <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">System Signal Clear</p>
                            </div>
                        ) : (
                            alerts.map((a) => (
                                <div key={a.id} className={`bg-white/[0.02] border p-6 rounded-2xl flex items-center justify-between gap-6 ${a.acknowledged ? "opacity-30 border-white/5" : "border-white/10"}`}>
                                    <div className="flex gap-6 items-start">
                                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-orange-500 font-black'}`} />
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${riskColor(a.severity)}`}>{a.severity}</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{a.tool}</span>
                                                <span className="text-[10px] font-bold text-white/40 font-mono italic">{new Date(a.timestamp).toLocaleString()}</span>
                                            </div>
                                            <p className="mt-2 text-sm font-bold text-white/80 leading-relaxed uppercase tracking-tight">{a.message}</p>
                                        </div>
                                    </div>
                                    <div>
                                        {!a.acknowledged && (
                                            <button
                                                onClick={() => acknowledgeAlert(a.id)}
                                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                            >
                                                Acknowledge
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
