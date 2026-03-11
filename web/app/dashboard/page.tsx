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
    findings?: string[];
    attachment_inspection_enabled?: boolean;
}



export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const [proxySummary, setProxySummary] = useState<ActivitySummary | null>(null);
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [browsersProtected, setBrowsersProtected] = useState(0);
    const [lastPolicyValidation, setLastPolicyValidation] = useState("");
    const [aiShieldActive, setAiShieldActive] = useState(true);
    const [lastUpdated, setLastUpdated] = useState("");
    const [loading, setLoading] = useState(true);
    // Extension health — populated via /api/auth/extension/ping GET
    const [extensionConnected, setExtensionConnected] = useState(false);
    const [extensionLastSeen, setExtensionLastSeen] = useState<string | null>(null);
    // ISSUE 4: 30d Exposure Flux — % change in violations vs prior 30d period
    const [exposureFlux, setExposureFlux] = useState<number | null>(null);

    const fetchNoCache = useCallback((url: string) => {
        return fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    }, []);

    const fetchData = useCallback(async () => {
        if (authLoading) return;

        try {
            const wsId = user?.uid || "default";

            // Fetch user's organizations so we can query activity stored under org IDs too
            const orgRes = await fetchNoCache(`/api/admin/organizations?workspaceId=${wsId}`);
            let orgIds: string[] = [];
            if (orgRes.ok) {
                const orgData = await orgRes.json();
                orgIds = (orgData.organizations || []).map((o: any) => o.id);
            }

            // Query activity from BOTH the user's UID workspace AND all org workspaces
            const workspaceIds = [wsId, ...orgIds.filter(id => id !== wsId)];
            // Fetch both 30d and 7d for flux calculation
            const activityPromises30d = workspaceIds.map(id =>
                fetchNoCache(`/api/proxy/activity?period=30d&events=50&workspaceId=${id}`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );
            const activityPromises7d = workspaceIds.map(id =>
                fetchNoCache(`/api/proxy/activity?period=7d&events=50&workspaceId=${id}`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );

            // Also check extension health for all org workspaces
            const extPingPromises = orgIds.map(id =>
                fetchNoCache(`/api/auth/extension/ping?orgId=${id}`)
                    .then(r => r.ok ? r.json() : null).catch(() => null)
            );

            const [agentRes, auditRes, settingsRes, ...allActivityResults] = await Promise.all([
                fetchNoCache(`/api/agent/heartbeat?workspaceId=${wsId}`),
                fetchNoCache(`/api/admin/audit/history`),
                fetchNoCache(`/api/proxy/settings?workspaceId=${wsId}`),
                ...activityPromises30d,
                ...activityPromises7d,
            ]);
            const activityResults = allActivityResults.slice(0, workspaceIds.length);
            const activity7dResults = allActivityResults.slice(workspaceIds.length);

            // Merge all activity results
            let allEvents: ActivityEvent[] = [];
            let mergedSummary: ActivitySummary | null = null;
            for (const data of activityResults) {
                if (!data) continue;
                if (data.events) allEvents = allEvents.concat(data.events);
                if (data.summary && (!mergedSummary || data.summary.total_requests > 0)) {
                    if (!mergedSummary) {
                        mergedSummary = data.summary;
                    } else {
                        mergedSummary.total_requests += data.summary.total_requests;
                        mergedSummary.total_violations += data.summary.total_violations;
                        mergedSummary.total_blocked += data.summary.total_blocked;
                        mergedSummary.activity_score = Math.max(mergedSummary.activity_score, data.summary.activity_score);
                    }
                }
            }

            // Sort events by timestamp (newest first) and deduplicate by id
            const seen = new Set<string>();
            allEvents = allEvents
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .filter(e => {
                    if (seen.has(e.id)) return false;
                    seen.add(e.id);
                    return true;
                });

            setProxySummary(mergedSummary);
            setEvents(allEvents);
            const uniqueExtensions = new Set(allEvents.map(e => e.user_hash)).size;
            setBrowsersProtected(uniqueExtensions || 0);

            // ISSUE 4: Compute 30d Exposure Flux
            // Compare violations in the 30d window to the 7d window (annualized rate)
            // Flux = ((30d violations / 30) - (7d violations / 7)) / (7d violations / 7) * 100
            let merged7dSummary: ActivitySummary | null = null;
            for (const data of activity7dResults) {
                if (!data?.summary) continue;
                if (!merged7dSummary) { merged7dSummary = data.summary; }
                else { merged7dSummary.total_violations += data.summary.total_violations; }
            }
            if (mergedSummary && merged7dSummary) {
                const dailyRate30d = mergedSummary.total_violations / 30;
                const dailyRate7d = merged7dSummary.total_violations / 7;
                if (dailyRate7d > 0) {
                    const flux = Math.round(((dailyRate30d - dailyRate7d) / dailyRate7d) * 100);
                    setExposureFlux(flux);
                } else if (dailyRate30d > 0) {
                    setExposureFlux(100); // new violations appearing
                } else {
                    setExposureFlux(0);
                }
            }

            // Resolve extension health from ping results
            const extPingResults = await Promise.all(extPingPromises);
            let extConnected = false;
            let extLastSeen: string | null = null;
            for (const ping of extPingResults) {
                if (ping?.connected) {
                    extConnected = true;
                    if (ping.last_seen && (!extLastSeen || ping.last_seen > extLastSeen)) {
                        extLastSeen = ping.last_seen;
                    }
                }
            }
            setExtensionConnected(extConnected);
            setExtensionLastSeen(extLastSeen);

            if (agentRes.ok && uniqueExtensions === 0) {
                const data = await agentRes.json();
                if (data.agents?.length > 0) setBrowsersProtected(data.agents.length);
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
        } catch (err) {
            console.error("[dashboard] fetchData failed", err);
        } finally {
            setLoading(false);
        }
    }, [user?.uid, authLoading, fetchNoCache]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
            const iv = setInterval(fetchData, 5000);
            return () => clearInterval(iv);
        }
    }, [fetchData, authLoading]);

    return (
        <div className="min-h-screen text-primary">
            <ExecutiveDashboard
                riskScore={proxySummary?.activity_score || 0}
                browsersProtected={browsersProtected}
                highRiskEvents={proxySummary?.total_violations || 0}
                blockedPrompts={proxySummary?.total_blocked || 0}
                aiShieldActive={aiShieldActive}
                lastPolicyValidation={lastPolicyValidation}
                lastUpdated={lastUpdated || "Just now"}
                recentActivity={events}
                promptsFlaggedToday={proxySummary?.total_violations || 0}
                activePolicies={0}
                exposureFlux={exposureFlux}
                extensionConnected={extensionConnected}
                extensionLastSeen={extensionLastSeen}
            />
        </div>
    );
}
