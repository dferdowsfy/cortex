"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import ExecutiveDashboard from "../components/ExecutiveDashboard";

/* ── Types ── */

interface ActivitySummary {
    total_requests: number;
    total_violations: number;
    total_blocked: number;
    avg_sensitivity_score: number;
    risk_trend: { date: string; score: number }[];
    total_tools: number;
}

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({ total: 0 });
    const [proxySummary, setProxySummary] = useState<ActivitySummary | null>(null);
    const [lastUpdated, setLastUpdated] = useState("");

    const fetchData = useCallback(async () => {
        try {
            const wsId = user?.uid || "default";
            const [toolRes, proxyRes] = await Promise.all([
                fetch(`/api/tools/stats?workspaceId=${wsId}`),
                fetch(`/api/proxy/activity?period=30d&workspaceId=${wsId}`),
            ]);

            if (toolRes.ok) {
                const data = await toolRes.json();
                setStats(data.stats);
            }
            if (proxyRes.ok) {
                const data = await proxyRes.json();
                setProxySummary(data.summary);
            }
            setLastUpdated(new Date().toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }));
        } catch { }
    }, []);

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 60000);
        return () => clearInterval(iv);
    }, [fetchData]);

    // Map real proxy risk trend data — no mock fallback so the dashboard
    // reflects actual traffic rather than hardcoded demo numbers.
    const activeTrend = proxySummary?.risk_trend && proxySummary.risk_trend.length > 0
        ? proxySummary.risk_trend.map(p => {
            const date = new Date(p.date + 'T12:00:00'); // Mid-day to avoid TZ shifts
            const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
            return { month, score: p.score };
        })
        : [];   // Empty array — no data yet, chart will show "No data" state

    return (
        <ExecutiveDashboard
            totalTools={proxySummary?.total_tools || stats.total || 0}
            highRiskEvents={proxySummary?.total_violations || 0}
            blockedPrompts={proxySummary?.total_blocked || 0}
            riskTrend={activeTrend}
            lastUpdated={lastUpdated || "Just now"}
        />
    );
}
