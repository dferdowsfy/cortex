"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DesktopAgentLauncher from "../components/DesktopAgentLauncher";
import DashboardStats from "../components/DashboardStats";
import DetectedToolsList from "../components/DetectedToolsList";
import RegisterToolModal from "../components/RegisterToolModal";

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

interface AgentData {
  status: "Healthy" | "Offline" | "Outdated" | "Connecting";
  last_sync: string;
}

/* ── Helpers ── */

function riskBadgeColor(tier: string): string {
  switch (tier?.toLowerCase()) {
    case "critical": return "bg-red-50 text-red-700 border-red-200";
    case "high": return "bg-orange-50 text-orange-700 border-orange-200";
    case "moderate": return "bg-amber-50 text-amber-700 border-amber-200";
    case "low": return "bg-green-50 text-green-700 border-green-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

/* ── Components ── */

function ToolRow({ tool, onDelete }: { tool: StoredTool; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded bg-gray-50 border border-gray-100 flex items-center justify-center font-bold text-gray-400 text-[10px] shadow-sm uppercase">
          {tool.tool_name.substring(0, 2)}
        </div>
        <div>
          <p className="font-bold text-gray-900 tracking-tight">{tool.tool_name}</p>
          <p className="text-xs text-gray-500 font-medium">
            {tool.vendor} · {tool.category}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-8">
        <div className="text-right text-[10px] text-gray-400 uppercase tracking-widest font-bold">
          <p>{tool.flag_count} Alerts</p>
          <p className="text-[9px] opacity-60">{tool.deployment_type || "SaaS"}</p>
        </div>
        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${riskBadgeColor(tool.risk_tier)}`}>
          {tool.risk_tier}
        </span>
        <button
          onClick={onDelete}
          className="rounded p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [tools, setTools] = useState<StoredTool[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, critical: 0, high: 0, moderate: 0, low: 0, governance_coverage: 100, overdue_assessments: 0 });
  const [discovered, setDiscovered] = useState<DiscoveredTool[]>([]);
  const [scanning, setScanning] = useState(false);
  const [agent, setAgent] = useState<AgentData>({ status: "Offline", last_sync: "Never" });
  const [showAllDiscovered, setShowAllDiscovered] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const toolRes = await fetch("/api/tools/stats");
      if (toolRes.ok) {
        const data = await toolRes.json();
        setTools(data.tools || []);
        setStats(data.stats);
      }

      const agentRes = await fetch("/api/agent/heartbeat");
      if (agentRes.ok) {
        const data = await agentRes.json();
        if (data.primary) {
          setAgent({
            status: data.primary.status,
            last_sync: data.primary.last_sync
          });
        }
      }

      // Discovered tools from registry-local
      const discRes = await fetch("/api/discover-local");
      if (discRes.ok) {
        const data = await discRes.json();
        setDiscovered(data.tools || []);
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(iv);
  }, [fetchData]);

  const runDiscoveryScan = async () => {
    setScanning(true);
    try {
      await fetch("/api/tools/discover", { method: "POST" });
      // Simulate progress delay
      await new Promise(r => setTimeout(r, 2000));
      await fetchData();
    } catch (e) {
    } finally {
      setScanning(false);
    }
  };

  const deleteTool = async (id: string) => {
    try {
      await fetch(`/api/tools/delete?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) { }
  };

  const pendingDiscovered = discovered.filter(d => !tools.some(t => t.tool_name.toLowerCase() === d.tool_name.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#F6F8FA] font-sans text-gray-900 antialiased">
      {/* ── Page Header Area ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="md:flex md:items-center md:justify-between mb-10">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:truncate">
                AI Governance Dashboard
              </h1>
              <p className="mt-2 text-base text-gray-500">
                Centralized visibility and risk control for enterprise AI ecosystems.
              </p>
            </div>
            <div className="mt-6 flex md:mt-0 md:ml-4 gap-3">
              <button
                onClick={runDiscoveryScan}
                disabled={scanning}
                className="inline-flex items-center px-6 py-3 border border-gray-300 text-sm font-bold rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all font-sans disabled:opacity-50"
              >
                {scanning ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning...
                  </span>
                ) : "Run Discovery"}
              </button>
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white bg-brand-600 hover:bg-brand-700 transition-all font-sans"
              >
                Register Tool
              </button>
            </div>
          </div>

          <DesktopAgentLauncher status={agent.status} lastSeen={agent.last_sync} />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <DashboardStats
          total={stats.total}
          critical={stats.critical}
          high={stats.high}
          moderate={stats.moderate}
          low={stats.low}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Governance Coverage</p>
              <p className="text-2xl font-bold text-gray-900">{stats.governance_coverage}%</p>
            </div>
            <div className="h-12 w-12 rounded-full border-4 border-brand-100 flex items-center justify-center">
              <div className="h-full w-full rounded-full border-4 border-brand-600 border-t-transparent animate-[spin_3s_linear_infinite]" style={{ clipPath: 'inset(0 0 0 50%)' }}></div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Overdue Assessments</p>
              <p className="text-2xl font-bold text-gray-900">{stats.overdue_assessments}</p>
            </div>
            <div className="h-10 px-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500"></span>
              <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Action Required</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Active Agents</p>
              <p className="text-2xl font-bold text-gray-900">{agent.status === "Healthy" ? "1" : "0"}</p>
            </div>
            <div className={`h-10 px-3 rounded-lg flex items-center gap-2 border ${agent.status === "Healthy" ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
              <span className={`h-2 w-2 rounded-full ${agent.status === "Healthy" ? "bg-green-500" : "bg-gray-300"}`}></span>
              <span className={`text-xs font-bold uppercase tracking-wider ${agent.status === "Healthy" ? "text-green-700" : "text-gray-400"}`}>
                {agent.status === "Healthy" ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Needs Assessment Action ── */}
        {pendingDiscovered.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 mb-10 flex items-start shadow-sm">
            <div className="flex-shrink-0 pt-0.5">
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Discovery Feed — Unassessed Assets ({pendingDiscovered.length})</h3>
              <p className="mt-1 text-sm text-amber-700 leading-relaxed font-medium">
                Autonomous discovery has identified AI services active within the corporate perimeter. Complete assessments to normalize governance status.
              </p>
            </div>
            <div className="ml-6 flex-shrink-0">
              <button
                className="text-sm font-bold text-amber-700 hover:text-amber-900 underline underline-offset-4 decoration-2 transition-colors"
                onClick={() => setShowAllDiscovered(!showAllDiscovered)}
              >
                {showAllDiscovered ? "Collapse Feed" : "Analyze Discoveries"}
              </button>
            </div>
          </div>
        )}

        {/* ── Detected Tools Feed ── */}
        {pendingDiscovered.length > 0 && (
          <div className="mb-12">
            <DetectedToolsList
              tools={showAllDiscovered ? pendingDiscovered : pendingDiscovered.slice(0, 4)}
              onDismiss={fetchData}
            />
          </div>
        )}

        {/* ── Authorized AI Inventory ── */}
        <section>
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden transition-all">
            <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
                Governance Inventory ({tools.length})
              </h3>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Real-time sync active</span>
              </div>
            </div>

            {tools.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {tools.map((tool) => (
                  <ToolRow key={tool.id} tool={tool} onDelete={() => deleteTool(tool.id)} />
                ))}
              </div>
            ) : (
              <div className="px-8 py-24 text-center">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 mb-8 text-gray-300">
                  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Enterprise Inventory Empty</h3>
                <p className="text-gray-500 max-w-sm mx-auto mb-10 leading-relaxed font-medium">
                  Autonomous governance requires an established asset registry. Register known AI tools or execute network discovery to begin.
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={runDiscoveryScan} className="bg-white border border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-all font-sans">
                    Run Discovery
                  </button>
                  <button onClick={() => setIsRegisterOpen(true)} className="bg-brand-600 text-white px-8 py-3 rounded-lg text-sm font-bold shadow-sm hover:bg-brand-700 transition-all font-sans">
                    Register Tool
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <RegisterToolModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}
