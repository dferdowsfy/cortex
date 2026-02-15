"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DesktopAgentLauncher from "../components/DesktopAgentLauncher";
import DashboardStats from "../components/DashboardStats";
import DetectedToolsList from "../components/DetectedToolsList";

/* ── Types ── */

interface StoredTool {
  id: string;
  tool_name: string;
  vendor: string;
  tier: string;
  category: string;
  risk_tier: string;
  governance_status: string;
  flag_count: number;
  rec_count: number;
  scanned_at: string;
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

function loadTools(): StoredTool[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("complyze_tools") || "[]");
  } catch {
    return [];
  }
}

function loadDiscovered(): DiscoveredTool[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("complyze_discovered") || "[]");
  } catch {
    return [];
  }
}

function riskColor(tier: string): string {
  switch (tier?.toLowerCase()) {
    case "critical":
      return "badge-critical";
    case "high":
      return "badge-high";
    case "moderate":
      return "badge-moderate";
    case "low":
      return "badge-low";
    default:
      return "badge-moderate";
  }
}

function confidenceIcon(c: string): string {
  return c === "high" ? "●" : c === "medium" ? "◐" : "○";
}

/* ── Stats Card ── */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-1 py-5">
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

/* ── Tool Row ── */

function ToolRow({ tool, onDelete }: { tool: StoredTool; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 last:border-0">
      <div className="flex items-center gap-4">
        <div>
          <p className="font-semibold text-gray-900">{tool.tool_name}</p>
          <p className="text-sm text-gray-500">
            {tool.vendor} · {tool.tier}
            {tool.category ? ` · ${tool.category}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right text-xs text-gray-400">
          <p>{tool.flag_count} flags</p>
          <p>{tool.rec_count} recs</p>
        </div>
        <span className={`badge ${riskColor(tool.risk_tier)}`}>
          {tool.risk_tier}
        </span>
        <button
          onClick={onDelete}
          className="rounded p-1 text-gray-300 hover:text-red-500 transition-colors"
          title="Remove tool"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Discovered Tool Row ── */

function DiscoveredRow({
  tool,
  onDismiss,
}: {
  tool: DiscoveredTool;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm" title={`Confidence: ${tool.confidence}`}>
          {confidenceIcon(tool.confidence)}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{tool.tool_name}</p>
          <p className="text-xs text-gray-500">
            {tool.vendor} · {tool.source}
          </p>
          {tool.detail && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-md">
              {tool.detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/scan?tool=${encodeURIComponent(tool.tool_name)}&vendor=${encodeURIComponent(tool.vendor)}&tier=${encodeURIComponent(tool.suggested_tier)}`}
          className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
        >
          Assess →
        </Link>
        <button
          onClick={onDismiss}
          className="rounded p-1 text-gray-300 hover:text-gray-500 transition-colors"
          title="Dismiss"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Page ── */

interface ProxySummary {
  activity_score: number;
  total_requests: number;
  total_violations: number;
  sensitive_prompt_pct: number;
  proxy_enabled: boolean;
}

export default function Dashboard() {
  const [tools, setTools] = useState<StoredTool[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredTool[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [proxySummary, setProxySummary] = useState<ProxySummary | null>(null);
  const [showAllDiscovered, setShowAllDiscovered] = useState(false);

  useEffect(() => {
    setTools(loadTools());
    setDiscovered(loadDiscovered());

    // Fetch proxy summary for the Activity-Informed Risk badge
    Promise.all([
      fetch("/api/proxy/activity?period=7d").then((r) => r.json()),
      fetch("/api/proxy/settings").then((r) => r.json()),
    ])
      .then(([activityData, settingsData]) => {
        setProxySummary({
          activity_score: activityData.summary?.activity_score || 0,
          total_requests: activityData.summary?.total_requests || 0,
          total_violations: activityData.summary?.total_violations || 0,
          sensitive_prompt_pct: activityData.summary?.sensitive_prompt_pct || 0,
          proxy_enabled: settingsData.proxy_enabled || false,
        });
      })
      .catch(() => { });
  }, []);

  const stats = {
    total: tools.length,
    critical: tools.filter((t) => t.risk_tier?.toLowerCase() === "critical").length,
    high: tools.filter((t) => t.risk_tier?.toLowerCase() === "high").length,
    moderate: tools.filter((t) => t.risk_tier?.toLowerCase() === "moderate").length,
    low: tools.filter((t) => t.risk_tier?.toLowerCase() === "low").length,
  };

  function deleteTool(id: string) {
    const updated = tools.filter((t) => t.id !== id);
    setTools(updated);
    localStorage.setItem("complyze_tools", JSON.stringify(updated));
    localStorage.removeItem(`complyze_assessment_${id}`);
  }

  function dismissDiscovered(toolName: string) {
    const updated = discovered.filter((d) => d.tool_name !== toolName);
    setDiscovered(updated);
    localStorage.setItem("complyze_discovered", JSON.stringify(updated));
  }

  /* ── Run discovery scan ── */
  const runDiscoveryScan = useCallback(async () => {
    setScanning(true);
    setScanMessage("Scanning for AI tools...");

    try {
      const res = await fetch("/api/discover-local");
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();

      const allDiscovered = (data.tools as DiscoveredTool[]) || [];

      // Filter out tools we've already assessed
      const assessedNames = new Set(tools.map((t) => t.tool_name.toLowerCase()));
      const newFinds = allDiscovered.filter(
        (d) => !assessedNames.has(d.tool_name.toLowerCase())
      );

      // Merge with existing discovered (deduplicate by name)
      const existingNames = new Set(discovered.map((d) => d.tool_name.toLowerCase()));
      const additional = newFinds.filter(
        (d) => !existingNames.has(d.tool_name.toLowerCase())
      );

      if (additional.length > 0) {
        const merged = [...discovered, ...additional];
        setDiscovered(merged);
        localStorage.setItem("complyze_discovered", JSON.stringify(merged));
        setScanMessage(
          data.mode === "registry"
            ? `📋 Loaded ${additional.length} AI tools from the enterprise registry. Select tools to assess.`
            : `🔍 Found ${additional.length} AI tool(s) on this machine.`
        );
      } else if (newFinds.length === 0 && tools.length > 0) {
        setScanMessage(`✅ All ${tools.length} discovered tools have been assessed. Add more tools manually or check the registry.`);
      } else {
        setScanMessage("All discovered tools are already listed below. Click \"Assess\" to scan any tool.");
      }
    } catch {
      setScanMessage("Could not reach discovery API. Use the Scan Tool page to add tools manually.");
    }
    setScanning(false);
  }, [tools, discovered]);

  // Filter discovered tools that haven't been assessed yet
  const assessedNames = new Set(tools.map((t) => t.tool_name.toLowerCase()));
  const pendingDiscovered = discovered.filter(
    (d) => !assessedNames.has(d.tool_name.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-sans text-text-main-light dark:text-text-main-dark antialiased transition-colors duration-200">
      {/* ── Desktop Agent Launcher ── */}
      <div className="mb-6 hidden lg:block">
        <DesktopAgentLauncher />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold leading-7 text-text-main-light dark:text-white sm:truncate">
              AI Governance Dashboard
            </h1>
            <p className="mt-1 text-sm text-text-muted-light dark:text-text-muted-dark">
              Discover, scan, and govern AI tools across your organization.
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
            <button
              onClick={runDiscoveryScan}
              disabled={scanning}
              className="inline-flex items-center px-4 py-2 border border-border-light dark:border-border-dark text-sm font-medium rounded shadow-sm text-text-main-light dark:text-white bg-white dark:bg-surface-dark hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
              type="button"
            >
              {scanning ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Scanning...
                </>
              ) : (
                <>
                  <span className="material-icons text-base mr-2">
                    wifi_tethering
                  </span>
                  Auto-Discover
                </>
              )}
            </button>
            <Link
              href="/scan"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded shadow-sm text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
            >
              <span className="material-icons text-base mr-2">add</span>
              Scan New Tool
            </Link>
            {tools.length > 0 && (
              <Link
                href="/report"
                className="inline-flex items-center px-4 py-2 border border-border-light dark:border-border-dark text-sm font-medium rounded shadow-sm text-text-main-light dark:text-white bg-white dark:bg-surface-dark hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
              >
                Generate Report
              </Link>
            )}
          </div>
        </div>

        {/* ── Scan Status Message ── */}
        {scanMessage && (
          <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {scanMessage}
          </div>
        )}

        <DashboardStats
          total={stats.total}
          critical={stats.critical}
          high={stats.high}
          moderate={stats.moderate}
          low={stats.low}
        />

        {/* ── Needs Assessment Alert ── */}
        {pendingDiscovered.length > 0 && (
          <div className="rounded bg-info-bg dark:bg-info-bg-dark border border-amber-200 dark:border-amber-900/30 p-4 mb-8 flex items-start">
            <span className="material-icons text-info-text dark:text-info-text-dark mr-3 text-lg mt-0.5">
              warning_amber
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-info-text dark:text-info-text-dark">
                AI Tool Registry — Needs Assessment ({pendingDiscovered.length})
              </h3>
              <div className="mt-1 text-sm text-info-text dark:text-info-text-dark opacity-80">
                Several new tools have been auto-discovered on the network. Please
                run governance scans to ensure compliance.
              </div>
            </div>
            <div>
              <button
                className="text-sm font-medium text-info-text dark:text-info-text-dark hover:underline"
                type="button"
                onClick={() => setShowAllDiscovered(!showAllDiscovered)}
              >
                {showAllDiscovered ? "Show Less" : "Assess All →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Detected Tools List ── */}
        {pendingDiscovered.length > 0 && (
          <DetectedToolsList
            tools={showAllDiscovered ? pendingDiscovered : pendingDiscovered.slice(0, 6)}
            onDismiss={dismissDiscovered}
          />
        )}

        {/* ── Assessed Tools List (Legacy view for now, can be improved) ── */}
        {tools.length > 0 && (
          <div className="mt-8 bg-surface-light dark:bg-surface-dark shadow-sm rounded border border-border-light dark:border-border-dark overflow-hidden">
            <div className="px-6 py-5 border-b border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="text-base font-semibold leading-6 text-text-main-light dark:text-white">
                Assessed Inventory ({tools.length})
              </h3>
            </div>
            {tools.map((tool) => (
              <ToolRow key={tool.id} tool={tool} onDelete={() => deleteTool(tool.id)} />
            ))}
          </div>
        )}

        {/* ── Empty State ── */}
        {tools.length === 0 && pendingDiscovered.length === 0 && (
          <div className="mt-12 text-center">
            <span className="material-icons text-4xl text-gray-300 mb-2">dashboard_customize</span>
            <h3 className="text-lg font-medium text-text-main-light dark:text-white">No tools governance data yet</h3>
            <p className="mt-1 text-sm text-text-muted-light dark:text-text-muted-dark">Run regular scans or auto-discover tools to populate your dashboard.</p>
          </div>
        )}

      </main>
    </div>
  );
}
