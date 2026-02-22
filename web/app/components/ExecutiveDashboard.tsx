"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

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
    totalTools: number;
    highRiskEvents: number;
    blockedPrompts: number;
    riskTrend: { month: string; score: number }[];
    lastUpdated: string;
    recentActivity?: ActivityEvent[];
}

export default function ExecutiveDashboard({
    totalTools,
    highRiskEvents,
    blockedPrompts,
    riskTrend,
    lastUpdated,
    recentActivity,
}: ExecutiveDashboardProps) {
    const [today, setToday] = useState("");

    useEffect(() => {
        setToday(new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        }));
    }, []);

    return (
        <div className="min-h-screen bg-[#0B1220] text-white p-8 font-sans antialiased">
            {/* ── Header Section ── */}
            <header className="mb-12">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-lg font-bold tracking-[0.2em] text-white/80 uppercase mb-1">
                            Executive Risk Summary
                        </h1>
                        <h2 className="text-4xl font-bold text-white mb-2">
                            {today}
                        </h2>
                        <span className="text-[10px] font-bold tracking-wider text-white/90 bg-white/5 px-3.5 py-1.5 rounded-full border border-white/[0.12] shadow-[0_0_12px_rgba(255,255,255,0.06)] backdrop-blur-sm uppercase">
                            Confidential Executive Briefing
                        </span>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] text-white/60 uppercase tracking-widest mb-1.5 font-bold">Monitoring Status</div>
                        <div className="flex items-center gap-2.5 justify-end">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                            <span className="text-xs font-bold text-white/80">ACTIVE</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <MetricCard
                    title="AI Tools Detected"
                    value={totalTools}
                    subtext="Active across organization"
                />
                <MetricCard
                    title="High-Risk Events"
                    value={highRiskEvents}
                    subtext="Critical incidents requiring attention"
                />
                <MetricCard
                    title="Blocked Prompts"
                    value={blockedPrompts}
                    subtext="Prevented sensitive data exposure attempts"
                />
            </div>

            {/* ── Two-Column Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* ── AI Risk Posture (Minimal Bar Panel) ── */}
                <RiskPosturePanel />

                {/* ── Recent Activity ── */}
                {recentActivity && (
                    <section className="bg-white/[0.03] border border-white/20 rounded-2xl p-8 shadow-[0_0_25px_rgba(255,255,255,0.05)] backdrop-blur-md flex flex-col overflow-hidden transition-all hover:border-white/30 hover:shadow-[0_0_35px_rgba(255,255,255,0.1)]">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold tracking-[0.15em] text-white/60 uppercase mb-2">
                                    Real-Time Monitoring
                                </h3>
                                <p className="text-xl font-bold text-white">
                                    Recent Activity
                                </p>
                            </div>
                        </div>

                        {recentActivity.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-sm text-white/30 font-medium">No recent activity detected.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.06] flex-1 overflow-y-auto pr-2 -mr-2">
                                {recentActivity.map((e) => (
                                    <div key={e.id} className="flex items-center justify-between py-4 group hover:bg-white/[0.02] -mx-4 px-4 transition-colors">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black tracking-tighter text-white shadow-lg ${e.sensitivity_score >= 60 ? "bg-red-500/90 shadow-red-500/20" : e.sensitivity_score >= 30 ? "bg-orange-500/90 shadow-orange-500/20" : "bg-emerald-500/90 shadow-emerald-500/20"}`}>
                                                {e.sensitivity_score}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-white/95 text-sm truncate">{e.tool}</p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {e.sensitivity_categories.filter((c) => c !== "none").map((cat) => (
                                                        <span key={cat} className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-white/10 text-white/70 uppercase tracking-widest">
                                                            {cat}
                                                        </span>
                                                    ))}
                                                    {e.sensitivity_categories.includes("none") && (
                                                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">CLEAN</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-white/50 font-mono bg-white/5 px-1.5 py-0.5 rounded">{e.user_hash}</span>
                                            </div>
                                            <p className="text-[10px] text-white/40 font-medium tracking-wide uppercase">
                                                {new Date(e.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            </p>
                                            {e.attachment_inspection_enabled !== undefined && (
                                                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${e.attachment_inspection_enabled ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-white/5 text-white/30 border border-white/10"}`}>
                                                    {e.attachment_inspection_enabled ? "FILES INSPECTED" : "FILES BYPASSED"}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>

            {/* ── Footer ── */}
            <footer className="mt-16 mb-8 flex justify-between items-center text-[11px] text-white/60 uppercase tracking-widest font-bold">
                <div>Last Updated: {lastUpdated}</div>
                <div>Complyze AI Risk Engine v2.4.0</div>
            </footer>
        </div>
    );
}

function MetricCard({ title, value, subtext }: { title: string; value: number | string; subtext: string }) {
    return (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-10 shadow-xl hover:bg-white/[0.06] transition-all group duration-500">
            <h3 className="text-sm font-bold tracking-widest text-white/75 uppercase mb-8 group-hover:text-white/90 transition-colors">
                {title}
            </h3>
            <div className="text-8xl font-black text-white mb-6 tracking-tighter">
                {value}
            </div>
            <p className="text-base text-white/75 leading-relaxed font-medium">
                {subtext}
            </p>
        </div>
    );
}

function RiskPosturePanel() {
    const [score, setScore] = useState(0);
    const targetScore = 22; // Hardcoded mock value as requested

    useEffect(() => {
        let current = 0;
        const duration = 600;
        const interval = 16;
        const step = (targetScore / duration) * interval;

        const timer = setInterval(() => {
            current += step;
            if (current >= targetScore) {
                setScore(targetScore);
                clearInterval(timer);
            } else {
                setScore(Math.floor(current));
            }
        }, interval);

        return () => clearInterval(timer);
    }, []);

    const axes = [
        { label: "Data Exposure", value: 30 },
        { label: "Prompt Sensitivity", value: 45 },
        { label: "Tool Sprawl", value: 15 },
        { label: "User Behavior", value: 20 },
        { label: "Policy Enforcement", value: 10 },
    ];

    const getPillColor = (val: number) => {
        if (val >= 60) return "text-red-300 bg-red-500/10 border-red-500/20";
        if (val >= 30) return "text-yellow-300 bg-yellow-500/10 border-yellow-500/20";
        return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
    };

    const getPillText = (val: number) => {
        if (val >= 60) return "high";
        if (val >= 30) return "moderate";
        return "low";
    };

    const getCategoryDesc = (val: number) => {
        if (val >= 61) return "High";
        if (val >= 26) return "Moderate";
        return "Low";
    };

    const getBarColor = (val: number) => {
        if (val >= 61) return "bg-[#FF5A5F]/80"; // Soft red
        if (val >= 26) return "bg-[#F5A623]/80"; // Amber
        return "bg-[#2ECC71]/80"; // Soft green
    };

    return (
        <section className="bg-white/[0.03] border border-white/20 rounded-2xl p-10 shadow-[0_0_25px_rgba(255,255,255,0.05)] backdrop-blur-md flex flex-col relative h-full transition-all hover:border-white/30 hover:shadow-[0_0_35px_rgba(255,255,255,0.1)]">
            {/* Top Center: Score */}
            <div className="flex flex-col items-center justify-center mb-12 mt-2">
                <p className="text-lg font-bold tracking-[0.2em] text-white/50 uppercase mb-5">
                    AI Risk Score
                </p>
                <div className="relative">
                    <div className="absolute w-40 h-40 bg-[radial-gradient(circle_at_center,_#3B36DB20_0%,_transparent_70%)] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                    <div className="flex items-baseline gap-2.5 relative z-10">
                        <span className="text-8xl font-black text-white tracking-tighter tabular-nums drop-shadow-sm">
                            {score}
                        </span>
                        <span className="text-white/20 text-4xl font-medium tracking-tight">/ 100</span>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className={`mt-6 px-6 py-2 rounded-full border text-sm font-bold uppercase tracking-[0.15em] backdrop-blur-md shadow-inner relative z-10 ${getPillColor(score)}`}
                >
                    {getPillText(score)}
                </motion.div>

                <p className="text-sm text-white/30 mt-6 font-medium tracking-wide">
                    Current organizational exposure
                </p>
                <p className="text-xs text-white/20 mt-1.5 uppercase tracking-widest">
                    Last updated: 2 mins ago
                </p>
            </div>

            {/* Bottom: Stacked Bars */}
            <div className="flex-1 flex flex-col justify-end space-y-7 pt-8 border-t border-white/[0.03]">
                {axes.map((axis, i) => (
                    <div key={axis.label} className="w-full">
                        <div className="flex justify-between items-end mb-3">
                            <span className="text-sm font-bold text-white/50 uppercase tracking-[0.1em]">
                                {axis.label}
                            </span>
                            <span className="text-sm font-bold text-white/70 tabular-nums">
                                {axis.value}
                            </span>
                        </div>
                        {/* Track */}
                        <div className="w-full h-2 bg-white/[0.03] rounded-full overflow-hidden relative">
                            {/* Fill */}
                            <motion.div
                                className={`absolute top-0 left-0 h-full rounded-full ${getBarColor(axis.value)}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${axis.value}%` }}
                                transition={{ duration: 0.8, delay: 0.3 + (i * 0.12), ease: "easeOut" }}
                            />
                        </div>
                        <p className="text-xs text-white/30 mt-2.5 font-medium tracking-wide uppercase">
                            {getCategoryDesc(axis.value)}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
