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
    activity_score: number;
    risk_trend: { date: string; score: number }[];
    total_tools: number;
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

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const [proxySummary, setProxySummary] = useState<ActivitySummary | null>(null);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [devicesProtected, setDevicesProtected] = useState(0);
    const [lastPolicyValidation, setLastPolicyValidation] = useState("");
    const [aiShieldActive, setAiShieldActive] = useState(true);
    const [lastUpdated, setLastUpdated] = useState("");
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (authLoading) return;

        try {
            const wsId = user?.uid || "default";
            const [proxyRes, agentRes, auditRes, settingsRes] = await Promise.all([
                fetch(`/api/proxy/activity?period=30d&events=5&workspaceId=${wsId}`),
                fetch(`/api/agent/heartbeat?workspaceId=${wsId}`),
                fetch(`/api/admin/audit/history`),
                fetch(`/api/proxy/settings?workspaceId=${wsId}`),
            ]);

            if (proxyRes.ok) {
                const data = await proxyRes.json();
                setProxySummary(data.summary);
                if (data.events) setEvents(data.events);
            }
            if (agentRes.ok) {
                const data = await agentRes.json();
                setDevicesProtected(data.agents?.length || 0);
            }
            if (auditRes.ok) {
                const data = await auditRes.json();
                const lastReport = data.reports?.[0];
                if (lastReport) {
                    setLastPolicyValidation(new Date(lastReport.timestamp || lastReport.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
                }
            }
            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setAiShieldActive(data.proxy_enabled);
            }

            setLastUpdated(new Date().toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' }));
        } catch { } finally {
            setLoading(false);
        }
    }, [user?.uid, authLoading]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
            const iv = setInterval(fetchData, 15000);
            return () => clearInterval(iv);
        }
    }, [fetchData, authLoading]);

    return (
        <ExecutiveDashboard
            riskScore={proxySummary?.activity_score || 0}
            devicesProtected={devicesProtected}
            highRiskEvents={proxySummary?.total_violations || 0}
            blockedPrompts={proxySummary?.total_blocked || 0}
            aiShieldActive={aiShieldActive}
            lastPolicyValidation={lastPolicyValidation}
            lastUpdated={lastUpdated || "Just now"}
            recentActivity={events}
        />
    );
}
