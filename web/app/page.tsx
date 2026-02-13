"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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
    <div className="space-y-8">
      {/* ── Hero ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            AI Governance Dashboard
          </h1>
          <p className="mt-1 text-gray-500">
            Discover, scan, and govern AI tools across your organization.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={runDiscoveryScan}
            disabled={scanning}
            className="btn-secondary"
          >
            {scanning ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning...
              </>
            ) : (
              <>
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Auto-Discover
              </>
            )}
          </button>
          <Link href="/scan" className="btn-primary">
            + Scan New Tool
          </Link>
          {tools.length > 0 && (
            <Link href="/report" className="btn-secondary">
              Generate Report
            </Link>
          )}
        </div>
      </div>

      {/* ── Scan Status Message ── */}
      {scanMessage && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {scanMessage}
        </div>
      )}

      {/* ── Stats ── */}
      {tools.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Total Tools" value={stats.total} color="text-brand-600" />
          <StatCard label="Critical" value={stats.critical} color="text-red-600" />
          <StatCard label="High" value={stats.high} color="text-orange-600" />
          <StatCard label="Moderate" value={stats.moderate} color="text-yellow-600" />
          <StatCard label="Low" value={stats.low} color="text-green-600" />
        </div>
      )}

      {/* ── Activity-Informed Risk Score Badge ── */}
      {proxySummary?.proxy_enabled && (
        <div className="card border-brand-200 bg-gradient-to-r from-brand-50 via-white to-brand-50/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 border-2 border-brand-200">
                <span
                  className={`text-xl font-bold ${proxySummary.activity_score >= 70 ? "text-red-600" :
                    proxySummary.activity_score >= 50 ? "text-orange-600" :
                      proxySummary.activity_score >= 30 ? "text-yellow-600" :
                        "text-green-600"
                    }`}
                >
                  {proxySummary.activity_score}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-900">Activity-Informed Risk Score</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Based on {proxySummary.total_requests} requests · {proxySummary.total_violations} violations · {proxySummary.sensitive_prompt_pct}% sensitive
                </p>
              </div>
            </div>
            <Link
              href="/monitoring"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
            >
              View Monitoring
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {/* ── Discovered Tools (pending assessment) ── */}
      {pendingDiscovered.length > 0 && (
        <div className="card p-0 overflow-hidden border-amber-200 bg-amber-50/30">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <h2 className="text-sm font-semibold text-amber-800">
                AI Tool Registry — Needs Assessment ({pendingDiscovered.length})
              </h2>
            </div>
            <span className="text-xs text-amber-600">
              Click &quot;Assess →&quot; to run a full governance scan
            </span>
          </div>
          {(showAllDiscovered ? pendingDiscovered : pendingDiscovered.slice(0, 6)).map((tool) => (
            <DiscoveredRow
              key={tool.tool_name}
              tool={tool}
              onDismiss={() => dismissDiscovered(tool.tool_name)}
            />
          ))}
          {pendingDiscovered.length > 6 && (
            <div className="border-t border-amber-200 bg-amber-50/50 px-4 py-2.5 text-center">
              <button
                onClick={() => setShowAllDiscovered(!showAllDiscovered)}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
              >
                {showAllDiscovered
                  ? "Show Less ↑"
                  : `Show All ${pendingDiscovered.length} Tools ↓`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tool List ── */}
      {tools.length === 0 && pendingDiscovered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <svg
              className="h-8 w-8 text-brand-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No tools scanned yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Click &quot;Auto-Discover&quot; to scan this machine, or manually add a tool.
          </p>
          <div className="mt-6 flex gap-3">
            <button onClick={runDiscoveryScan} disabled={scanning} className="btn-secondary">
              Auto-Discover Tools
            </button>
            <Link href="/scan" className="btn-primary">
              Add Manually
            </Link>
          </div>

          {/* ── Desktop Agent Instructions ── */}
          <div className="mt-8 w-full max-w-lg rounded-lg border border-gray-200 bg-gray-50 p-5">
            <h4 className="text-sm font-semibold text-gray-700">
              For deeper scanning, run the Desktop Agent:
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              The agent scans installed apps, running processes, browser
              extensions, IDE plugins, and active network connections
              for AI tools.
            </p>
            <pre className="mt-3 rounded-lg bg-gray-900 px-4 py-3 text-xs text-green-400 overflow-x-auto">
              <code>{`cd Cortex && npx tsx scanner/discover.ts --push`}</code>
            </pre>
          </div>
        </div>
      ) : tools.length > 0 ? (
        <div className="card p-0 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Assessed Tools ({tools.length})
            </h2>
          </div>
          {tools.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              onDelete={() => deleteTool(tool.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
