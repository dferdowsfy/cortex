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

    return (
        <div className="min-h-screen bg-[#09090b] text-white p-6 md:p-10 font-sans antialiased max-w-7xl mx-auto flex flex-col">
            {/* ── Header Section (Reduced spacing) ── */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-white/5 pb-6 gap-4">
                <div>
                    <h1 className="text-sm font-bold tracking-[0.2em] text-zinc-500 uppercase">
                        Executive Snapshot
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                    <div className="text-right">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 font-bold font-mono">AI Shield Status</div>
                        <div className="flex items-center gap-2 justify-end">
                            <span className={`w-2 h-2 rounded-full ${aiShieldActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" : "bg-zinc-600"}`} />
                            <span className="text-[11px] font-bold text-zinc-300">{aiShieldActive ? "ACTIVE" : "INACTIVE"}</span>
                        </div>
                    </div>
                    <div className="text-right border-l border-white/10 pl-6">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 font-bold font-mono">Last Policy Validation</div>
                        <span className="text-[11px] font-bold text-zinc-300">{lastPolicyValidation || "Never"}</span>
                    </div>
                    <Link href="/dashboard/reports" className="bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold py-2.5 px-5 rounded-lg border border-white/10 transition-all uppercase tracking-[0.15em] ml-2">
                        View Executive Report
                    </Link>
                </div>
            </header>

            {/* ── Main content (Single scroll focus) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">

                {/* AI Risk Score (Primary focus) */}
                <section className="lg:col-span-5 bg-white/[0.02] border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden group">
                    {/* Subtle Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 blur-[100px] pointer-events-none group-hover:bg-indigo-500/10 transition-colors duration-1000" />

                    <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-10 relative z-10">
                        AI Risk Score
                    </h3>

                    <div className="relative z-10">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[120px] font-black text-white tracking-tighter tabular-nums drop-shadow-2xl">
                                {animatedScore}
                            </span>
                            <span className="text-zinc-800 text-5xl font-black">/100</span>
                        </div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-10 px-8 py-2.5 rounded-full border text-[11px] font-black uppercase tracking-[0.2em] backdrop-blur-md relative z-10 ${riskScore >= 60 ? "text-red-400 border-red-500/20 bg-red-500/5" :
                            riskScore >= 30 ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                                "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                            }`}
                    >
                        {riskScore >= 60 ? "High Risk Exposure" : riskScore >= 30 ? "Moderate Exposure" : "Low Risk Exposure"}
                    </motion.div>

                    <p className="mt-12 text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] relative z-10">
                        Organizational Safety Posture
                    </p>
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
                    <section className="flex-1 bg-white/[0.02] border border-white/10 rounded-2xl p-8 flex flex-col">
                        {metricsAreZero ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
                                    <svg className="w-6 h-6 text-emerald-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h3 className="text-xl font-bold text-zinc-300 mb-2 italic">“Are we safe?”</h3>
                                <p className="text-sm text-emerald-500/80 font-bold uppercase tracking-widest">
                                    No high-risk activity detected in the last 30 days.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase font-mono">
                                        Observed Risk Signals
                                    </h3>
                                    <span className="text-[10px] text-zinc-600 font-bold flex items-center gap-1.5 uppercase tracking-wider bg-white/5 px-2 py-1 rounded border border-white/5">
                                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                        Streaming Logs
                                    </span>
                                </div>
                                <div className="space-y-1 overflow-y-auto pr-2 -mr-2">
                                    {recentActivity?.slice(0, 5).map((e) => (
                                        <div key={e.id} className="flex items-center justify-between py-4 border-b border-white/[0.03] last:border-0 group hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
                                            <div className="flex items-center gap-5">
                                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-black text-white shadow-sm transition-transform group-hover:scale-105 ${e.sensitivity_score >= 60 ? "bg-red-500/80" :
                                                    e.sensitivity_score >= 30 ? "bg-amber-500/80" :
                                                        "bg-emerald-500/80"
                                                    }`}>
                                                    {e.sensitivity_score}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-zinc-100 text-sm truncate">{e.tool}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[9px] text-zinc-500 font-bold font-mono tracking-tighter uppercase">{e.user_hash}</span>
                                                        <span className="text-zinc-800 font-black text-[9px]">/</span>
                                                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex gap-1 justify-end">
                                                    {e.sensitivity_categories.filter(c => c !== 'none').slice(0, 1).map(cat => (
                                                        <span key={cat} className="text-[9px] font-black text-indigo-400/80 uppercase tracking-tighter bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                                                            {cat}
                                                        </span>
                                                    ))}
                                                </div>
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
            <footer className="mt-10 mb-2 flex justify-between items-center text-[9px] text-zinc-700 uppercase tracking-[0.4em] font-black border-t border-white/5 pt-6">
                <div>Feed: {lastUpdated}</div>
                <div>Executive Snap v3.0 · BOARD_READY</div>
            </footer>
        </div>
    );
}

function MinimalMetricCard({ title, value }: { title: string; value: number | string }) {
    return (
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 transition-all border-b-2 border-b-zinc-800">
            <h3 className="text-[10px] font-bold tracking-[0.15em] text-zinc-600 uppercase mb-4 font-mono">
                {title}
            </h3>
            <div className="text-4xl font-black text-zinc-100 tracking-tight">
                {value}
            </div>
        </div>
    );
}
