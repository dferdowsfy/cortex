"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

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

interface ExecutiveDashboardProps {
    riskScore: number;
    devicesProtected: number;
    highRiskEvents: number;
    blockedPrompts: number;
    aiShieldActive: boolean;
    lastPolicyValidation: string;
    lastUpdated: string;
    recentActivity?: ActivityEvent[];
}

export default function ExecutiveDashboard({
    riskScore,
    devicesProtected,
    highRiskEvents,
    blockedPrompts,
    aiShieldActive,
    lastPolicyValidation,
    lastUpdated,
    recentActivity,
}: ExecutiveDashboardProps) {
    const [animatedScore, setAnimatedScore] = useState(0);

    useEffect(() => {
        let current = 0;
        const duration = 1000;
        const interval = 16;
        const step = (riskScore / duration) * interval;

        const timer = setInterval(() => {
            current += step;
            if (current >= riskScore) {
                setAnimatedScore(riskScore);
                clearInterval(timer);
            } else {
                setAnimatedScore(Math.floor(current));
            }
        }, interval);

        return () => clearInterval(timer);
    }, [riskScore]);

    const metricsAreZero = highRiskEvents === 0 && blockedPrompts === 0;

    const riskTheme = {
        color: riskScore >= 60 ? "text-red-500" : riskScore >= 30 ? "text-amber-500" : "text-emerald-500",
        badge: riskScore >= 60 ? "bg-red-600 text-white" : riskScore >= 30 ? "bg-amber-500 text-white" : "bg-emerald-600 text-white",
        label: riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MODERATE" : "LOW",
    };

    return (
        <div className="min-h-screen text-primary p-6 md:p-10 font-sans antialiased max-w-7xl mx-auto flex flex-col">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 border-b border-[var(--border-main)] pb-8 gap-4">
                <div>
                    <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-white">
                        Executive Snapshot
                    </h1>
                    <p className="text-muted text-xs font-bold mt-2 uppercase tracking-[0.2em]">Real-time security posture across all endpoints</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                    <div className="text-right">
                        <div className="text-[10px] text-muted uppercase tracking-widest mb-1 font-bold font-mono">AI Shield Status</div>
                        <div className="flex items-center gap-2 justify-end">
                            <span className={`w-2 h-2 rounded-full ${aiShieldActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" : "bg-zinc-600"}`} />
                            <span className="text-[11px] font-bold text-primary">{aiShieldActive ? "ACTIVE" : "INACTIVE"}</span>
                        </div>
                    </div>
                    <div className="text-right border-l border-[var(--border-main)] pl-6">
                        <div className="text-[10px] text-muted uppercase tracking-widest mb-1 font-bold font-mono">Last Policy Validation</div>
                        <span className="text-[11px] font-bold text-primary">{lastPolicyValidation || "Never"}</span>
                    </div>
                    <Link href="/dashboard/reports" className="bg-[var(--card-bg)] hover:bg-white/10 text-primary text-[11px] font-bold py-2.5 px-5 rounded-lg border border-[var(--border-main)] transition-all uppercase tracking-[0.15em] ml-2">
                        View Executive Report
                    </Link>
                </div>
            </header>

            {/* Main content (Single scroll focus) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">

                {/* AI Risk Score (Primary focus) */}
                <section className="lg:col-span-5 card flex flex-col items-center justify-center relative overflow-hidden group shadow-2xl border-none ring-1 ring-[var(--border-main)] py-12">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-[var(--brand-color)] opacity-80" />
                    <header className="mb-10 text-center">
                        <h2 className="text-[13px] font-black text-[var(--text-primary)] uppercase tracking-[0.4em] mb-2 font-mono">Current AI Risk</h2>
                    </header>
                    <div className="relative">
                        <svg className="w-64 h-64 transform -rotate-90">
                            <circle cx="128" cy="128" r="116" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-[var(--border-soft)]" />
                            <motion.circle
                                cx="128" cy="128" r="116" stroke="currentColor" strokeWidth="16" fill="transparent"
                                strokeDasharray={2 * Math.PI * 116}
                                initial={{ strokeDashoffset: 2 * Math.PI * 116 }}
                                animate={{ strokeDashoffset: (2 * Math.PI * 116) * (1 - riskScore / 100) }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className={riskTheme.color}
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.span
                                key={riskScore}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-[96px] font-black italic tracking-tighter tabular-nums text-[var(--text-primary)] leading-none"
                            >
                                {riskScore}
                            </motion.span>
                        </div>
                    </div>
                    <div className="mt-12 text-center">
                        <div className={`px-10 py-3 rounded-xl text-[12px] font-black uppercase tracking-[0.2em] shadow-xl ${riskTheme.badge} border-none`}>
                            {riskTheme.label} Risk Posture
                        </div>
                    </div>
                </section>

                {/* Metrics + Activity */}
                <div className="lg:col-span-7 flex flex-col gap-8">

                    {/* Metric Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <MinimalMetricCard title="Devices Protected" value={devicesProtected} />
                        <MinimalMetricCard title="High-Risk Events" value={highRiskEvents} />
                        <MinimalMetricCard title="Blocked Prompts" value={blockedPrompts} />
                    </div>

                    {/* Operational Feedback / Events */}
                    <section className="flex-1 card flex flex-col">
                        {metricsAreZero ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
                                    <svg className="w-6 h-6 text-emerald-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h3 className="text-xl font-bold text-primary mb-2 italic">“Are we safe?”</h3>
                                <p className="text-sm text-emerald-500/80 font-bold uppercase tracking-widest">
                                    No high-risk activity detected in the last 30 days.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-[11px] font-bold tracking-[0.2em] text-muted uppercase font-mono">
                                        Observed Risk Signals
                                    </h3>
                                    <span className="text-[10px] text-muted font-bold flex items-center gap-1.5 uppercase tracking-wider bg-[var(--card-bg)] px-2 py-1 rounded border border-[var(--border-main)]">
                                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                        Streaming Logs
                                    </span>
                                </div>
                                <div className="space-y-1 overflow-y-auto pr-2 -mr-2">
                                    {(recentActivity || []).slice(0, 5).map((event) => (
                                        <div key={event.id} className="flex items-center justify-between group/item py-2 border-b border-[var(--border-soft)] last:border-0 pb-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-tight">{event.tool_domain?.split('.')[0] || "Unknown Tool"}</span>
                                                <span className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-0.5">{event.risk_category || "General Activity"}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-[10px] font-black px-3 py-1 rounded bg-[var(--bg-page)] border uppercase tracking-widest ${event.policy_violation_flag ? 'text-red-600 border-red-200 dark:border-red-900/50' : 'text-[var(--text-muted)] border-[var(--border-main)]'}`}>
                                                    {event.policy_violation_flag ? 'Blocked' : 'Monitored'}
                                                </div>
                                                <div className="text-[10px] text-[var(--text-muted)] font-black mt-2 font-mono">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* Footer */}
            <footer className="mt-10 mb-2 flex justify-between items-center text-[9px] text-muted uppercase tracking-[0.4em] font-black border-t border-[var(--border-main)] pt-6">
                <div>Feed: {lastUpdated}</div>
                <div>Executive Snap v3.0 · BOARD_READY</div>
            </footer>
        </div>
    );
}

function MinimalMetricCard({ title, value }: { title: string; value: string | number }) {
    return (
        <div className="card text-center p-8 transition-transform hover:scale-[1.02]">
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4 font-mono">{title}</p>
            <p className="text-4xl font-black text-primary italic tracking-tighter tabular-nums">{value}</p>
        </div>
    );
}
