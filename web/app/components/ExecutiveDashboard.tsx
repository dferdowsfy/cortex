"use client";

import { useEffect, useRef, useState } from "react";

interface ExecutiveDashboardProps {
    totalTools: number;
    highRiskEvents: number;
    blockedPrompts: number;
    riskTrend: { month: string; score: number }[];
    lastUpdated: string;
}

export default function ExecutiveDashboard({
    totalTools,
    highRiskEvents,
    blockedPrompts,
    riskTrend,
    lastUpdated,
}: ExecutiveDashboardProps) {
    const [today, setToday] = useState("");

    useEffect(() => {
        setToday(new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        }));
    }, []);

    const delta = riskTrend.length >= 2
        ? riskTrend[0].score - riskTrend[riskTrend.length - 1].score
        : 0;

    return (
        <div className="min-h-screen bg-[#0B1220] text-white p-8 font-sans antialiased">
            {/* ── Header Section ── */}
            <header className="mb-12">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-sm font-bold tracking-[0.2em] text-white/80 uppercase mb-1">
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

            {/* ── Risk Trend Chart Section ── */}
            <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-10 shadow-2xl backdrop-blur-md">
                <div className="flex justify-between items-end mb-12">
                    <div>
                        <h3 className="text-sm font-bold tracking-widest text-white/75 uppercase mb-2.5">
                            Monthly Risk Summary
                        </h3>
                        <p className="text-2xl font-bold text-white">
                            Risk Reduction Trend (Last 6 Months)
                        </p>
                    </div>
                    <div className="text-right text-xs text-white/75 font-medium">
                        Target Risk: <span className="text-white/90 font-bold font-mono">20%</span>
                    </div>
                </div>

                <div className="h-[300px] w-full relative">
                    <ExecutiveRiskChart data={riskTrend} />
                </div>

                <div className="mt-10 pt-8 border-t border-white/5">
                    <p className="text-white/80 leading-relaxed max-w-3xl">
                        AI risk has decreased by <span className="text-white font-bold">{Math.abs(delta)}%</span> over the last 6 months, driven by improved policy enforcement and proactive monitoring.
                        The organization remains on track to reach the <span className="text-white font-bold underline decoration-[#3B36DB]/40">20% target threshold</span> by Q3.
                    </p>
                </div>
            </section>

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

function ExecutiveRiskChart({ data }: { data: { month: string; score: number }[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;
        const padding = { top: 20, bottom: 40, left: 40, right: 20 };
        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;

        ctx.clearRect(0, 0, W, H);

        // Grid lines (horizontal)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (i / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
            ctx.font = "bold 11px Inter, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(`${100 - i * 25}%`, padding.left - 10, y + 4);
        }

        // Target line (dotted)
        const targetY = padding.top + chartH - (20 / 100) * chartH;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(59, 54, 219, 0.7)";
        ctx.beginPath();
        ctx.moveTo(padding.left, targetY);
        ctx.lineTo(W - padding.right, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Data processing
        const points = data.map((d, i) => ({
            x: padding.left + (i / (data.length - 1)) * chartW,
            y: padding.top + chartH - (d.score / 100) * chartH,
            label: d.month
        }));

        // Gradient for the line
        const gradient = ctx.createLinearGradient(0, 0, W, 0);
        gradient.addColorStop(0, "#fafafaff");
        gradient.addColorStop(1, "rgba(250, 250, 250, 0.6)");

        // Draw line with glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(59, 54, 219, 0.5)";
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.beginPath();
        points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else {
                // Smooth curve (Bezier)
                const prev = points[i - 1];
                const cp1x = prev.x + (p.x - prev.x) / 2;
                ctx.bezierCurveTo(cp1x, prev.y, cp1x, p.y, p.x, p.y);
            }
        });
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Fill area below line
        const fillGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        fillGradient.addColorStop(0, "rgba(59, 54, 219, 0.1)");
        fillGradient.addColorStop(1, "rgba(59, 54, 219, 0)");

        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        points.forEach((p, i) => {
            if (i === 0) ctx.lineTo(p.x, p.y);
            else {
                const prev = points[i - 1];
                const cp1x = prev.x + (p.x - prev.x) / 2;
                ctx.bezierCurveTo(cp1x, prev.y, cp1x, p.y, p.x, p.y);
            }
        });
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();

        // X-axis labels and points
        points.forEach((p, i) => {
            // Label
            ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
            ctx.textAlign = "center";
            ctx.font = "bold 11px Inter, sans-serif";
            ctx.fillText(p.label, p.x, H - 10);

            // Point dot
            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#3B36DB";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

    }, [data]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
        />
    );
}
