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

interface ProxyHealth {
    proxy_server_running: boolean;
    os_proxy_active: boolean;
    proxy_enabled: boolean;
}

/* ── Proxy Status Banner ── */
function ProxyStatusBanner({ health, onStartProxy }: { health: ProxyHealth | null; onStartProxy: () => void }) {
    if (!health) return null;

    const isFullyActive = health.proxy_server_running && health.os_proxy_active && health.proxy_enabled;
    const isRunningButSysProxyOff = health.proxy_server_running && !health.os_proxy_active;
    const isToggleOnButNotRunning = health.proxy_enabled && !health.proxy_server_running;

    if (isFullyActive) return null; // All good — no banner needed

    if (!health.proxy_enabled) return null; // User intentionally turned it off

    return (
        <div className={`rounded-xl border px-5 py-4 mb-6 flex items-start gap-4 ${isRunningButSysProxyOff
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-red-500/30 bg-red-500/10"
            }`}>
            <div className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${isRunningButSysProxyOff ? "bg-amber-500" : "bg-red-500"}`}>
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
            </div>

            <div className="flex-1 min-w-0">
                {isToggleOnButNotRunning && (
                    <>
                        <p className="text-sm font-bold text-red-400 mb-1">⚠️ AI Shield Not Intercepting — Proxy Server Down</p>
                        <p className="text-xs text-red-300/80 leading-relaxed mb-3">
                            The AI monitoring toggle is ON but the local proxy server is not running.
                            Sensitive prompts sent to ChatGPT, Claude, and Gemini are <strong className="text-red-300">NOT being captured</strong>.
                        </p>
                        <p className="text-xs text-red-300/60 font-mono mb-3">
                            Run in terminal: <code className="bg-red-900/30 px-2 py-0.5 rounded text-red-300">cd cortex/web && ./scripts/start-shield.sh</code>
                        </p>
                        <button
                            onClick={onStartProxy}
                            className="text-xs font-bold px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white transition-colors"
                        >
                            Start Proxy & Enable System Proxy
                        </button>
                    </>
                )}
                {isRunningButSysProxyOff && (
                    <>
                        <p className="text-sm font-bold text-amber-400 mb-1">⚠️ Proxy Running — System Proxy Route Missing</p>
                        <p className="text-xs text-amber-300/80 leading-relaxed mb-3">
                            The local proxy server is running on <strong className="text-amber-300">127.0.0.1:8080</strong> but your
                            macOS System Proxy is <strong className="text-amber-300">disabled</strong>.
                            Browser traffic bypasses the proxy and sensitive prompts are <strong className="text-amber-300">not captured</strong>.
                        </p>
                        <p className="text-xs text-amber-300/60 font-mono mb-3">
                            Run: <code className="bg-amber-900/30 px-2 py-0.5 rounded text-amber-300">./scripts/start-shield.sh</code>
                        </p>
                        <button
                            onClick={onStartProxy}
                            className="text-xs font-bold px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
                        >
                            Enable System Proxy
                        </button>
                    </>
                )}
            </div>

            <div className="shrink-0 text-right">
                <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5 justify-end">
                        <span className={`w-1.5 h-1.5 rounded-full ${health.proxy_server_running ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className={health.proxy_server_running ? "text-emerald-400" : "text-red-400"}>
                            Proxy Server {health.proxy_server_running ? "Running" : "Stopped"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                        <span className={`w-1.5 h-1.5 rounded-full ${health.os_proxy_active ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className={health.os_proxy_active ? "text-emerald-400" : "text-red-400"}>
                            System Proxy {health.os_proxy_active ? "ON" : "OFF"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
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
    const [proxyHealth, setProxyHealth] = useState<ProxyHealth | null>(null);
    const [startingProxy, setStartingProxy] = useState(false);

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
                setProxyHealth({
                    proxy_server_running: data.proxy_server_running ?? false,
                    os_proxy_active: data.os_proxy_active ?? false,
                    proxy_enabled: data.proxy_enabled ?? false,
                });
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

    /**
     * Attempt to start the local proxy + enable system proxy via the settings API.
     * This works when the Next.js server is running locally.
     */
    const handleStartProxy = useCallback(async () => {
        if (startingProxy) return;
        setStartingProxy(true);
        try {
            const wsId = user?.uid || "default";
            const res = await fetch("/api/proxy/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proxy_enabled: true, workspaceId: wsId }),
            });
            if (res.ok) {
                // Refresh health after a short delay for the proxy to start
                setTimeout(fetchData, 3000);
            }
        } catch {
            // best-effort
        } finally {
            setTimeout(() => setStartingProxy(false), 4000);
        }
    }, [user?.uid, fetchData, startingProxy]);

    return (
        <div className="min-h-screen text-primary">
            <div className="max-w-7xl mx-auto px-6 pt-6">
                <ProxyStatusBanner health={proxyHealth} onStartProxy={handleStartProxy} />
            </div>

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
        </div>
    );
}
