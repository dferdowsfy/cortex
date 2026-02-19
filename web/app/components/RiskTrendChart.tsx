"use client";

import { useEffect, useRef } from "react";

/* ── Risk Trend Chart ────────────────────────────────────────────
   Simple line graph: "AI Risk Trend (Last 30 Days)"
   Total risk score + critical incidents over time.
   Minimal axis labels, no heavy legends.
   Pure canvas — no chart library dependency. */

interface TrendPoint {
    date: string;       // e.g. "Feb 1"
    riskScore: number;
    criticalCount: number;
}

interface RiskTrendProps {
    data?: TrendPoint[];
}

function generateMockData(): TrendPoint[] {
    const points: TrendPoint[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        // Simulated trend: gradual improvement with some spikes
        const base = 65 - (29 - i) * 0.5 + Math.sin(i * 0.4) * 8;
        const critical = Math.max(0, Math.round(2 + Math.sin(i * 0.6) * 2));
        points.push({
            date: label,
            riskScore: Math.round(Math.max(20, Math.min(95, base))),
            criticalCount: critical,
        });
    }
    return points;
}

export default function RiskTrendChart({ data }: RiskTrendProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const points = data && data.length > 0 ? data : generateMockData();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const renderChart = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            // Avoid 0x0 canvas
            if (rect.width === 0 || rect.height === 0) return;

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const W = rect.width;
            const H = rect.height;
            const padL = 40, padR = 16, padT = 16, padB = 32;
            const chartW = W - padL - padR;
            const chartH = H - padT - padB;

            // Clear
            ctx.clearRect(0, 0, W, H);

            // Scales
            const maxRisk = 100;
            const maxCrit = Math.max(5, ...points.map(p => p.criticalCount));

            function xPos(i: number) { return padL + (i / (points.length - 1)) * chartW; }
            function yRisk(v: number) { return padT + chartH - (v / maxRisk) * chartH; }
            function yCrit(v: number) { return padT + chartH - (v / maxCrit) * chartH; }

            // Grid lines
            ctx.strokeStyle = "#f3f4f6";
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padT + (i / 4) * chartH;
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(W - padR, y);
                ctx.stroke();
            }

            // Y-axis labels
            ctx.fillStyle = "#9ca3af";
            ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "right";
            for (let i = 0; i <= 4; i++) {
                const val = Math.round((4 - i) / 4 * maxRisk);
                const y = padT + (i / 4) * chartH;
                ctx.fillText(String(val), padL - 8, y + 4);
            }

            // X-axis labels (reduce frequency on small screens if needed)
            ctx.textAlign = "center";
            ctx.fillStyle = "#9ca3af";
            const step = W < 500 ? 14 : 7; // Show fewer labels on small screens
            for (let i = 0; i < points.length; i += step) {
                if (i === points.length - 1) continue; // Handle last separately
                ctx.fillText(points[i].date, xPos(i), H - 8);
            }
            // Always show last point
            ctx.fillText(points[points.length - 1].date, xPos(points.length - 1), H - 8);

            // Critical incidents area
            ctx.beginPath();
            ctx.moveTo(xPos(0), padT + chartH);
            points.forEach((p, i) => ctx.lineTo(xPos(i), yCrit(p.criticalCount)));
            ctx.lineTo(xPos(points.length - 1), padT + chartH);
            ctx.closePath();
            ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
            ctx.fill();

            // Critical line
            ctx.beginPath();
            points.forEach((p, i) => {
                if (i === 0) ctx.moveTo(xPos(i), yCrit(p.criticalCount));
                else ctx.lineTo(xPos(i), yCrit(p.criticalCount));
            });
            ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Risk score line
            ctx.beginPath();
            points.forEach((p, i) => {
                if (i === 0) ctx.moveTo(xPos(i), yRisk(p.riskScore));
                else ctx.lineTo(xPos(i), yRisk(p.riskScore));
            });
            ctx.strokeStyle = "#6366f1";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Risk score area fill
            ctx.beginPath();
            ctx.moveTo(xPos(0), padT + chartH);
            points.forEach((p, i) => ctx.lineTo(xPos(i), yRisk(p.riskScore)));
            ctx.lineTo(xPos(points.length - 1), padT + chartH);
            ctx.closePath();
            ctx.fillStyle = "rgba(99, 102, 241, 0.06)";
            ctx.fill();

            // End dot
            const last = points[points.length - 1];
            ctx.beginPath();
            ctx.arc(xPos(points.length - 1), yRisk(last.riskScore), 4, 0, Math.PI * 2);
            ctx.fillStyle = "#6366f1";
            ctx.fill();
        };

        // Initial render
        renderChart();

        // Handle resize
        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(renderChart);
        });
        observer.observe(canvas);

        return () => observer.disconnect();
    }, [points]);

    return (
        <section className="bg-white border border-gray-200 rounded-lg p-8 mb-10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">
                    AI Risk Trend (Last 30 Days)
                </h2>
                <div className="flex items-center gap-5 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-[2px] bg-indigo-500 rounded" />
                        Risk Score
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-[2px] bg-red-400 rounded" />
                        Critical Incidents
                    </span>
                </div>
            </div>
            <canvas
                ref={canvasRef}
                className="w-full h-[220px]"
                style={{ width: "100%", height: 220 }}
            />
        </section>
    );
}
