"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import RiskPostureSnapshot from "../components/RiskPostureSnapshot";
import ExecutiveRiskSummary from "../components/ExecutiveRiskSummary";
import DiscoveryFeed from "../components/DiscoveryFeed";
import RiskTrendChart from "../components/RiskTrendChart";

/* ── Types ── */

interface StoredTool {
    id: string;
    tool_name: string;
    vendor: string;
    category: string;
    risk_tier: "critical" | "high" | "moderate" | "low";
    governance_status: string;
    flag_count: number;
    rec_count: number;
    deployment_type?: string;
}

interface DiscoveredTool {
    tool_name: string;
    vendor: string;
    suggested_tier: string;
    source: string;
    detail: string;
    confidence: string;
}

/* ── Helpers ── */

function tierAccent(tier: string): string {
    switch (tier?.toLowerCase()) {
        case "critical": return "bg-red-500";
        case "high": return "bg-orange-500";
        case "moderate": return "bg-amber-400";
        case "low": return "bg-green-500";
        default: return "bg-gray-300";
    }
}

function tierText(tier: string): string {
    switch (tier?.toLowerCase()) {
        case "critical": return "text-red-700 bg-red-50 border-red-200";
        case "high": return "text-orange-700 bg-orange-50 border-orange-200";
        case "moderate": return "text-amber-700 bg-amber-50 border-amber-200";
        case "low": return "text-green-700 bg-green-50 border-green-200";
        default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
}

/* ── Dashboard ── */

export default function Dashboard() {
    const [tools, setTools] = useState<StoredTool[]>([]);
    const [stats, setStats] = useState({
        total: 0, critical: 0, high: 0, moderate: 0, low: 0,
        governance_coverage: 100, overdue_assessments: 0,
    });
    const [discovered, setDiscovered] = useState<DiscoveredTool[]>([]);
    const [agentOnline, setAgentOnline] = useState(false);
    const [filterTier, setFilterTier] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [toolRes, agentRes, discRes] = await Promise.all([
                fetch("/api/tools/stats"),
                fetch("/api/agent/heartbeat"),
                fetch("/api/discover-local"),
            ]);

            if (toolRes.ok) {
                const data = await toolRes.json();
                setTools(data.tools || []);
                setStats(data.stats);
            }
            if (agentRes.ok) {
                const data = await agentRes.json();
                setAgentOnline(data.primary?.status === "Healthy");
            }
            if (discRes.ok) {
                const data = await discRes.json();
                setDiscovered(data.tools || []);
            }
        } catch { }
    }, []);

    useEffect(() => {
        fetchData();
        const iv = setInterval(fetchData, 30000);
        return () => clearInterval(iv);
    }, [fetchData]);

    const pendingDiscovered = discovered.filter(
        d => !tools.some(t => t.tool_name.toLowerCase() === d.tool_name.toLowerCase())
    );

    const filteredTools = filterTier
        ? tools.filter(t => t.risk_tier === filterTier)
        : tools;

    const deleteTool = async (id: string) => {
        try {
            await fetch(`/api/tools/delete?id=${id}`, { method: "DELETE" });
            fetchData();
        } catch { }
    };

    return (
        <div className="font-sans text-gray-900 antialiased">
            {/* ── Page Header ── */}
            <div className="mb-10 flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                        AI Risk Command Center
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Enterprise AI exposure and governance posture
                    </p>
                </div>
            </div>

            {/* ── Section 1: Risk Posture Snapshot ── */}
            <RiskPostureSnapshot
                total={stats.total}
                critical={stats.critical}
                high={stats.high}
                moderate={stats.moderate}
                low={stats.low}
                onFilter={setFilterTier}
                activeTier={filterTier}
            />

            {/* ── Section 2: Executive Risk Summary ── */}
            <ExecutiveRiskSummary
                governanceCoverage={stats.governance_coverage}
                activeAgents={agentOnline ? 1 : 0}
                unassessedAssets={pendingDiscovered.length}
                openActions={stats.overdue_assessments}
                totalAssets={stats.total}
                criticalCount={stats.critical}
            />

            {/* ── Section 3: Discovery Feed ── */}
            <DiscoveryFeed count={pendingDiscovered.length} />

            {/* ── Section 4: Trend Visualization ── */}
            <RiskTrendChart />

            {/* ── Governance Inventory ── */}
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">
                        Governance Inventory
                        {filterTier && (
                            <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                                — filtered by {filterTier} risk
                                <button onClick={() => setFilterTier(null)} className="ml-2 text-brand-600 hover:text-brand-700 underline">
                                    clear
                                </button>
                            </span>
                        )}
                    </h2>
                    <span className="text-xs text-gray-400">{filteredTools.length} asset{filteredTools.length !== 1 ? "s" : ""}</span>
                </div>

                {filteredTools.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                <th className="px-6 py-3">Asset</th>
                                <th className="px-6 py-3">Vendor</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3">Alerts</th>
                                <th className="px-6 py-3">Risk</th>
                                <th className="px-6 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredTools.map((tool) => (
                                <tr key={tool.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-1 h-8 rounded-full ${tierAccent(tool.risk_tier)}`} />
                                            <span className="font-semibold text-gray-900">{tool.tool_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">{tool.vendor}</td>
                                    <td className="px-6 py-4 text-gray-500">{tool.category}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-medium ${tool.flag_count > 0 ? "text-red-600" : "text-gray-400"}`}>
                                            {tool.flag_count}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold uppercase border ${tierText(tool.risk_tier)}`}>
                                            {tool.risk_tier}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => deleteTool(tool.id)}
                                            className="text-gray-300 hover:text-red-500 transition-colors"
                                            title="Remove"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="px-6 py-20 text-center">
                        <p className="text-sm text-gray-400 mb-4">
                            {filterTier
                                ? `No ${filterTier}-risk assets found.`
                                : "No AI assets registered yet."
                            }
                        </p>
                        {!filterTier && (
                            <Link
                                href="/scan"
                                className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
                            >
                                Discover AI Assets
                            </Link>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
