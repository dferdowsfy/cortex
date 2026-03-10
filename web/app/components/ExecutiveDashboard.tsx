"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react";

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
    findings?: string[];
    full_prompt?: string;
    attachment_inspection_enabled?: boolean;
}

interface ExecutiveDashboardProps {
    riskScore: number;
    browsersProtected: number;
    highRiskEvents: number;
    blockedPrompts: number;
    aiShieldActive: boolean;
    lastPolicyValidation: string;
    lastUpdated: string;
    recentActivity?: ActivityEvent[];
    // Extension health (optional, from heartbeat)
    extensionConnected?: boolean;
    extensionLastSeen?: string | null;
    extensionHostname?: string | null;
    activePolicies?: number;
    promptsFlaggedToday?: number;
    exposureFlux?: number | null;
}

/* ─── Dynamic risk gradient ─────────────────────────────────────────────────
   0–30   green   #16A34A → #22C55E
   31–70  orange  #F97316 → #FB923C
   71–100 red     #DC2626 → #EF4444
   Returns a CSS linear-gradient string.
*/
function riskGradient(score: number): string {
    if (score <= 30) return "linear-gradient(135deg, #16A34A, #22C55E)";
    if (score <= 70) return "linear-gradient(135deg, #F97316, #FB923C)";
    return "linear-gradient(135deg, #DC2626, #EF4444)";
}
function riskTextColor(score: number): string {
    if (score <= 30) return "#22C55E";
    if (score <= 70) return "#FB923C";
    return "#EF4444";
}
function riskLabel(score: number): string {
    if (score <= 30) return "LOW";
    if (score <= 70) return "MODERATE";
    return "HIGH";
}

/* ─── Extension status dot ─────────────────────────────────────────────────── */
function ExtStatusRow({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
    const color = ok ? "#22C55E" : warn ? "#F59E0B" : "#475569";
    return (
        <div className="flex items-center gap-2.5">
            <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ background: color, boxShadow: ok ? `0 0 6px ${color}88` : undefined }}
            />
            <span className="text-[12px] font-medium" style={{ color: ok ? "#d1fae5" : warn ? "#fde68a" : "#64748b" }}>
                {label}
            </span>
        </div>
    );
}

export default function ExecutiveDashboard({
    riskScore,
    browsersProtected,
    highRiskEvents,
    blockedPrompts,
    aiShieldActive,
    lastPolicyValidation,
    lastUpdated,
    recentActivity,
    extensionConnected = false,
    extensionLastSeen = null,
    extensionHostname = null,
    activePolicies = 0,
    promptsFlaggedToday = 0,
    exposureFlux = null,
}: ExecutiveDashboardProps) {
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

    // Format last-seen time
    const lastSeenLabel = (() => {
        if (!extensionLastSeen) return "Never";
        const diff = Math.floor((Date.now() - new Date(extensionLastSeen).getTime()) / 60000);
        if (diff < 1) return "Just now";
        if (diff < 60) return `${diff}m ago`;
        return `${Math.floor(diff / 60)}h ago`;
    })();

    return (
        <div className="text-primary p-6 md:p-10 font-sans antialiased max-w-7xl mx-auto flex flex-col">

            {/* Header Section */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b border-[var(--border-main)] pb-8 gap-4">
                <div>
                    <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none text-white">
                        Executive Snapshot
                    </h1>
                    <p className="text-secondary text-sm font-bold mt-2 uppercase tracking-[0.2em]">Real-time security posture across browser extensions</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                    <div className="text-right">
                        <div className="text-[12px] text-white/40 uppercase tracking-widest mb-1 font-bold font-mono">AI Shield Status</div>
                        <div className="flex items-center gap-2 justify-end">
                            <span className={`w-2 h-2 rounded-full ${aiShieldActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" : "bg-zinc-600"}`} />
                            <span className="text-[13px] font-bold text-white">{aiShieldActive ? "ACTIVE" : "INACTIVE"}</span>
                        </div>
                    </div>
                    <div className="text-right border-l border-[var(--border-main)] pl-6">
                        <div className="text-[12px] text-white/40 uppercase tracking-widest mb-1 font-bold font-mono">Last Policy Validation</div>
                        <span className="text-[13px] font-bold text-white">{lastPolicyValidation || "Never"}</span>
                    </div>
                    <Link href="/dashboard/reports" className="bg-white/5 hover:bg-white/10 text-white text-[13px] font-black py-2.5 px-6 rounded-lg border border-white/10 transition-all uppercase tracking-[0.2em] ml-2">
                        View Executive Report
                    </Link>
                </div>
            </header>

            {/* ── Top Row: Risk Card + Extension Status (fixed height, no scroll expansion) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">

                {/* ── Issue 1 + 2: Compact AI Risk Card with dynamic gradient, fixed height ── */}
                <section
                    className="lg:col-span-5 rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden flex flex-col"
                    style={{ height: "248px", flexShrink: 0 }}
                >
                    {/* Gradient header bar */}
                    <div
                        className="flex items-center justify-between px-5 py-3.5"
                        style={{ background: riskGradient(riskScore) }}
                    >
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/90 font-mono">Current AI Risk</span>
                        <span className="text-[11px] font-black uppercase tracking-widest bg-black/20 text-white px-2.5 py-0.5 rounded-full">
                            {riskLabel(riskScore)}
                        </span>
                    </div>

                    {/* Body */}
                    <div className="flex-1 bg-[#0d1225] flex flex-col justify-between p-5">
                        {/* Score + summary */}
                        <div className="flex items-center gap-4">
                            <motion.span
                                key={riskScore}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-[72px] font-black italic tracking-tighter tabular-nums leading-none"
                                style={{ color: riskTextColor(riskScore) }}
                            >
                                {riskScore}
                            </motion.span>
                            <div className="flex flex-col gap-1 pb-1">
                                <span className="text-[13px] text-white/30 font-bold">/ 100</span>
                                {exposureFlux !== null && exposureFlux !== undefined && (
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${exposureFlux > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                        {exposureFlux > 0 ? `▲ +${exposureFlux}%` : `▼ ${exposureFlux}%`} {exposureFlux > 0 ? "Flux" : "Improving"}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Three metric tiles */}
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: "Flagged Today", value: promptsFlaggedToday },
                                { label: "Blocked", value: blockedPrompts },
                                { label: "Active Policies", value: activePolicies || browsersProtected },
                            ].map((m) => (
                                <div key={m.label} className="bg-white/[0.04] rounded-xl p-2.5 border border-white/5 text-center">
                                    <p className="text-[20px] font-black text-white tabular-nums leading-none mb-1">{m.value}</p>
                                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-tight">{m.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Issue 3: Extension Status Block ── */}
                <section
                    className="lg:col-span-7 rounded-2xl ring-1 ring-white/10 bg-[#0d1225] shadow-2xl flex flex-col overflow-hidden"
                    style={{ height: "248px", flexShrink: 0 }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50 font-mono">Extension Health</span>
                        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${extensionConnected
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-white/5 text-white/20 border-white/10"
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${extensionConnected ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                            {extensionConnected ? "Online" : "Offline"}
                        </span>
                    </div>

                    {/* Status rows */}
                    <div className="flex-1 flex flex-col justify-center px-5 py-4 gap-3">
                        <ExtStatusRow ok={extensionConnected} label="Extension Installed" />
                        <ExtStatusRow ok={extensionConnected} label="Connection Status" />
                        <ExtStatusRow ok={extensionConnected} label={`Shield Logic ${extensionConnected ? "Applied" : "Disabled"}`} />
                        <div className="flex items-center gap-2.5 border-t border-white/5 pt-3 mt-1">
                            <Clock className="w-3 h-3 text-white/20 flex-shrink-0" />
                            <span className="text-[11px] text-white/30 font-mono">
                                Last Activity: <span className="text-white/50 font-bold">{lastSeenLabel}</span>
                                {extensionHostname && <> · <span className="text-white/40">{extensionHostname}</span></>}
                            </span>
                        </div>
                    </div>

                    {/* Metric row */}
                    <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5">
                        {[
                            { label: "Extensions Active", value: browsersProtected },
                            { label: "High-Risk Events", value: highRiskEvents },
                            { label: "Blocked Prompts", value: blockedPrompts },
                        ].map((m) => (
                            <div key={m.label} className="px-4 py-3 text-center">
                                <p className="text-[18px] font-black text-white tabular-nums leading-none">{m.value}</p>
                                <p className="text-[8px] font-black text-white/25 uppercase tracking-widest mt-1 leading-tight">{m.label}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ── Activity Feed ── */}
            <div className="flex-1">
                <section className="card flex flex-col p-8">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-[13px] font-bold tracking-[0.2em] text-white/40 uppercase font-mono">
                            Observed Risk Signals
                        </h3>
                        <span className="text-[10px] text-white/40 font-bold flex items-center gap-1.5 uppercase tracking-wider bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-white/5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
                            Live Intelligence Feed
                        </span>
                    </div>

                    {(!recentActivity || recentActivity.length === 0) ? (
                        <div className="flex flex-col items-center justify-center text-center py-12 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                            <ShieldAlert className="w-8 h-8 text-white/10 mb-4" />
                            <p className="text-[11px] text-white/20 font-black uppercase tracking-[0.3em]">Waiting for high-risk signals...</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentActivity.slice(0, 10).map((event) => (
                                <div key={event.id} className="group/item">
                                    <button
                                        onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                                        className={`w-full flex items-center justify-between py-3.5 px-6 rounded-xl border transition-all text-left ${expandedEventId === event.id
                                            ? "bg-white/[0.05] border-white/20 ring-1 ring-white/10"
                                            : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col">
                                                <span className="text-base font-black text-white italic tracking-tight uppercase">{event.tool_domain?.split('.')[0] || event.tool || "AI Core"}</span>
                                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-[0.1em] mt-0.5">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                            </div>
                                            <div className="h-8 w-px bg-white/5" />
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${event.policy_violation_flag
                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                    }`}>
                                                    {event.policy_violation_flag ? "Violated" : "Monitored"}
                                                </span>
                                                <span className="text-[11px] font-black text-white/30 uppercase tracking-widest">{event.risk_category} Risk</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <span className="text-[14px] font-black text-white block leading-none">{event.sensitivity_score}</span>
                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Score</span>
                                            </div>
                                            <ChevronDown className={`w-4 h-4 text-white/20 transition-transform duration-300 ${expandedEventId === event.id ? "rotate-180 text-white/60" : ""}`} />
                                        </div>
                                    </button>

                                    {expandedEventId === event.id && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-2 p-6 rounded-xl border border-white/10 bg-black/40 shadow-inner"
                                        >
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div>
                                                    <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-4">Scoring Logic Analysis</h4>
                                                    <div className="space-y-3">
                                                        {(event.findings || ["DLP Match: Potential Sensitive Data Exposure", "Acceptable Use Policy Check Failed"]).map((finding, idx) => (
                                                            <div key={idx} className="flex gap-3 text-[13px] text-white/70 leading-relaxed font-medium">
                                                                <span className="text-orange-500 shrink-0">•</span>
                                                                {finding}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 rounded-xl p-5 border border-white/5 flex flex-col gap-4">
                                                    <div>
                                                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-2">Endpoint Context</h4>
                                                        <div className="grid grid-cols-2 gap-y-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] text-white/20 font-black uppercase">Identity Hash</span>
                                                                <span className="text-[11px] text-white/80 font-mono truncate">{event.user_hash || "ANONYMOUS"}</span>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] text-white/20 font-black uppercase">Payload Size</span>
                                                                <span className="text-[11px] text-white/80">{event.token_count_estimate || 0} Tokens</span>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] text-white/20 font-black uppercase">Result</span>
                                                                <span className="text-[11px] font-bold text-orange-400">{event.policy_violation_flag ? "Terminated & Logged" : "Intercepted & Validated"}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {event.full_prompt && (
                                                        <div className="flex flex-col border-t border-white/5 pt-4 overflow-hidden">
                                                            <span className="text-[10px] text-white/20 font-black uppercase mb-2">Original Prompt Extract</span>
                                                            <div className="text-[12px] text-white/60 font-medium italic break-words line-clamp-3 bg-white/[0.02] p-3 rounded-lg border border-white/[0.05]">
                                                                &ldquo;{event.full_prompt}&rdquo;
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            ))}
                            <div className="pt-4 text-center">
                                <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em]">End of recent signal buffer</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* Footer */}
            <footer className="mt-10 mb-2 flex justify-between items-center text-[11px] text-muted uppercase tracking-[0.4em] font-black border-t border-[var(--border-main)] pt-6">
                <div>Feed: {lastUpdated}</div>
                <div>Executive Snap v3.1 · BOARD_READY</div>
            </footer>
        </div>
    );
}
