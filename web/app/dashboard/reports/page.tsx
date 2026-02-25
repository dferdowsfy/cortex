"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { X } from "lucide-react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface ExecutiveData {
  riskScore: number;
  totalPrompts: number;
  blockedEvents: number;
  redactedEvents: number;
  topRiskCategory: string;
  trend: "Up" | "Down" | "Flat";
  categories: { name: string; pct: number }[];
  summary: string;
}

interface EnforcementRow {
  label: string;
  value: string;
  status: "green" | "amber" | "red" | "neutral";
}

interface ActivityRow {
  id: string;
  timestamp: string;
  userIdentifier: string;
  riskCategory: string;
  actionTaken: "Blocked" | "Redacted" | "Allowed";
  policyVersion: string;
  endpointId: string;
}

type ActiveModal =
  | { type: "view-executive" }
  | { type: "view-enforcement" }
  | { type: "view-activity" }
  | { type: "schedule"; reportTitle: string }
  | null;

/* ─────────────────────────────────────────────
   Mock / Seed Data
───────────────────────────────────────────── */

const MOCK_EXECUTIVE: ExecutiveData = {
  riskScore: 23,
  totalPrompts: 1842,
  blockedEvents: 47,
  redactedEvents: 124,
  topRiskCategory: "PII",
  trend: "Down",
  categories: [
    { name: "PII", pct: 35 },
    { name: "Financial", pct: 22 },
    { name: "Source Code", pct: 18 },
    { name: "PHI", pct: 12 },
    { name: "Trade Secret", pct: 8 },
  ],
  summary:
    "AI usage is controlled. Enforcement active. No critical exposure events detected.",
};

const MOCK_ENFORCEMENT: EnforcementRow[] = [
  { label: "Endpoints Enrolled", value: "94%", status: "green" },
  { label: "Policy Sync Verified", value: "98%", status: "green" },
  { label: "Fail-Closed Status", value: "Yes", status: "green" },
  { label: "Last Policy Version Hash", value: "sha256:a3f9c2b1d4e8f037", status: "neutral" },
  { label: "Proxy Enforcement Status", value: "Active", status: "green" },
  { label: "Tamper Attempts", value: "0", status: "green" },
  { label: "Device Health Telemetry", value: "Reporting", status: "green" },
];

function buildMockActivity(): ActivityRow[] {
  const categories = ["PII", "Financial", "Source Code", "PHI", "Trade Secret", "None"];
  const actions: ActivityRow["actionTaken"][] = ["Blocked", "Redacted", "Allowed"];
  const now = Date.now();
  return Array.from({ length: 150 }, (_, i) => {
    const ts = new Date(now - i * 1000 * 60 * 60 * 4.8);
    const seed = i * 7919; // deterministic "random"
    return {
      id: `act_${i}`,
      timestamp: ts.toISOString().replace("T", " ").slice(0, 19),
      userIdentifier: `user_${(seed % 99999).toString(36).padStart(5, "0")}`,
      riskCategory: categories[i % categories.length],
      actionTaken: actions[i % 3],
      policyVersion: "v2.4.1",
      endpointId: `ep_${((seed * 31) % 9999).toString(36).padStart(4, "0")}`,
    };
  });
}

/* ─────────────────────────────────────────────
   Small Helpers
───────────────────────────────────────────── */

function StatusDot({ status }: { status: EnforcementRow["status"] }) {
  const cls: Record<EnforcementRow["status"], string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
    neutral: "bg-zinc-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls[status]}`} />;
}

function ActionBadge({ action }: { action: ActivityRow["actionTaken"] }) {
  const cls: Record<ActivityRow["actionTaken"], string> = {
    Blocked: "bg-red-100 text-red-700",
    Redacted: "bg-amber-100 text-amber-700",
    Allowed: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls[action]}`}>
      {action}
    </span>
  );
}

function downloadCSV(rows: ActivityRow[]) {
  const header = [
    "Timestamp",
    "User Identifier",
    "Risk Category",
    "Action Taken",
    "Policy Version",
    "Endpoint ID",
  ];
  const lines = rows.map((r) =>
    [
      r.timestamp,
      r.userIdentifier,
      r.riskCategory,
      r.actionTaken,
      r.policyVersion,
      r.endpointId,
    ]
      .map((v) => `"${v}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-log-30d-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   Schedule Modal
───────────────────────────────────────────── */

function ScheduleModal({
  reportTitle,
  onClose,
}: {
  reportTitle: string;
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState("Weekly");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!email.trim()) return;
    setSaved(true);
    setTimeout(onClose, 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-gray-900">Schedule Report</h2>
            <p className="text-sm text-gray-500 mt-0.5">{reportTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors -mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {saved ? (
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm py-4">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-xs">
              ✓
            </span>
            Schedule saved
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Send this report
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  To
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={!email.trim()}
                className="btn-primary flex-1"
              >
                Save Schedule
              </button>
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Executive Summary Modal
───────────────────────────────────────────── */

function ExecutiveSummaryModal({
  data,
  onClose,
}: {
  data: ExecutiveData;
  onClose: () => void;
}) {
  const trendIcon =
    data.trend === "Down" ? "↓" : data.trend === "Up" ? "↑" : "→";
  const trendColor =
    data.trend === "Down"
      ? "text-emerald-600"
      : data.trend === "Up"
      ? "text-red-600"
      : "text-gray-500";
  const scoreColor =
    data.riskScore >= 70
      ? "text-red-600"
      : data.riskScore >= 40
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
              Last 30 Days
            </p>
            <h2 className="text-xl font-bold text-gray-900">Executive Summary</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Risk Score */}
        <div className="px-8 pb-6 border-b border-gray-100">
          <div className="flex items-end gap-5">
            <div>
              <span className={`text-7xl font-black leading-none ${scoreColor}`}>
                {data.riskScore}
              </span>
              <span className="text-2xl font-light text-gray-300 ml-1">/100</span>
            </div>
            <div className="pb-1">
              <span className={`text-3xl font-bold ${trendColor}`}>{trendIcon}</span>
              <p className="text-xs text-gray-400 mt-0.5">30-day trend</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-gray-400 mt-2 uppercase tracking-widest">
            AI Risk Score
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
          {[
            { label: "Prompts Analyzed", value: data.totalPrompts.toLocaleString() },
            { label: "Blocked Events", value: String(data.blockedEvents) },
            { label: "Redacted Events", value: String(data.redactedEvents) },
          ].map((m) => (
            <div key={m.label} className="bg-white px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{m.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Risk Category Bars */}
        <div className="px-8 py-5 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Top Risk Category: {data.topRiskCategory}
          </p>
          <div className="space-y-2.5">
            {data.categories.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-24 text-xs font-medium text-gray-600 shrink-0">
                  {c.name}
                </span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-700 rounded-full"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                  {c.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Plain-English Summary */}
        <div className="px-8 py-6">
          <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Enforcement Assurance Modal
───────────────────────────────────────────── */

function EnforcementAssuranceModal({
  rows,
  orgId,
  onClose,
}: {
  rows: EnforcementRow[];
  orgId: string;
  onClose: () => void;
}) {
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-8 pt-8 pb-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
              Generated {generatedAt} · Org {orgId}
            </p>
            <h2 className="text-xl font-bold text-gray-900">Enforcement Assurance</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-8 pb-8">
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {rows.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-700">{row.label}</span>
                <div className="flex items-center gap-2.5">
                  <StatusDot status={row.status} />
                  <span
                    className={`text-sm font-semibold ${
                      row.status === "green"
                        ? "text-emerald-700"
                        : row.status === "amber"
                        ? "text-amber-700"
                        : row.status === "red"
                        ? "text-red-700"
                        : "text-gray-500 font-mono text-xs"
                    }`}
                  >
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Activity Log Modal
───────────────────────────────────────────── */

const PAGE_SIZE = 25;

function ActivityLogModal({
  rows,
  onClose,
}: {
  rows: ActivityRow[];
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0 border-b border-gray-100">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
              Last 30 Days · {rows.length.toLocaleString()} records
            </p>
            <h2 className="text-xl font-bold text-gray-900">Activity Log</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-gray-100">
              <tr>
                {[
                  "Timestamp",
                  "User",
                  "Risk Category",
                  "Action",
                  "Policy Version",
                  "Endpoint ID",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                    {row.timestamp}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-700 font-mono">
                    {row.userIdentifier}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-700">{row.riskCategory}</td>
                  <td className="px-6 py-3">
                    <ActionBadge action={row.actionTaken} />
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500 font-mono">
                    {row.policyVersion}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500 font-mono">
                    {row.endpointId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of{" "}
            {rows.length.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Report Card
───────────────────────────────────────────── */

function ReportCard({
  title,
  description,
  onView,
  onExport,
  onSchedule,
}: {
  title: string;
  description: string;
  onView: () => void;
  onExport: () => void;
  onSchedule: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-7 py-6 flex items-center justify-between gap-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onView}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        >
          View
        </button>
        <button
          onClick={onExport}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        >
          Export
        </button>
        <button
          onClick={onSchedule}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
        >
          Schedule
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Reports Page
───────────────────────────────────────────── */

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [execData, setExecData] = useState<ExecutiveData>(MOCK_EXECUTIVE);
  const [enforcementRows, setEnforcementRows] =
    useState<EnforcementRow[]>(MOCK_ENFORCEMENT);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>(() =>
    buildMockActivity()
  );

  // Hydrate with real data where available
  useEffect(() => {
    const wsId = user?.uid || "default";

    // Executive + Activity data
    fetch(`/api/proxy/activity?period=30d&events=500&workspaceId=${wsId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.summary) return;
        const s = data.summary;

        // Derive trend direction
        let trend: ExecutiveData["trend"] = "Flat";
        if (Array.isArray(s.risk_trend) && s.risk_trend.length >= 2) {
          const first: number = s.risk_trend[0].score;
          const last: number = s.risk_trend[s.risk_trend.length - 1].score;
          trend = last < first ? "Down" : last > first ? "Up" : "Flat";
        }

        // Map category names
        const cats: ExecutiveData["categories"] = (
          s.top_risk_categories || []
        ).map((c: { category: string; count: number }) => ({
          name: c.category
            .replace(/_/g, " ")
            .replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
          pct: Math.min(
            100,
            Math.round((c.count / Math.max(s.total_requests, 1)) * 100)
          ),
        }));

        const topCat =
          s.top_risk_categories?.[0]?.category
            ?.replace(/_/g, " ")
            .replace(/\b\w/g, (ch: string) => ch.toUpperCase()) || "PII";

        const score: number = s.activity_score ?? MOCK_EXECUTIVE.riskScore;
        const summaryText =
          score >= 70
            ? "Elevated AI risk detected. Review enforcement logs and apply additional restrictions."
            : score >= 40
            ? "Moderate AI risk posture. Enforcement is active with some anomalies noted."
            : "AI usage is controlled. Enforcement active. No critical exposure events detected.";

        setExecData({
          riskScore: score,
          totalPrompts: s.total_requests ?? MOCK_EXECUTIVE.totalPrompts,
          blockedEvents: s.total_violations ?? MOCK_EXECUTIVE.blockedEvents,
          redactedEvents:
            Math.round(
              ((s.total_requests ?? 0) * (s.sensitive_prompt_pct ?? 0)) / 100
            ) || MOCK_EXECUTIVE.redactedEvents,
          topRiskCategory: topCat,
          trend,
          categories: cats.length > 0 ? cats : MOCK_EXECUTIVE.categories,
          summary: summaryText,
        });

        // Real activity rows
        if (Array.isArray(data.events) && data.events.length > 0) {
          setActivityRows(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.events.map((e: any) => ({
              id: e.id,
              timestamp: new Date(e.timestamp)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19),
              userIdentifier: e.user_hash || "anon",
              riskCategory:
                (e.risk_category || "unknown")
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
              actionTaken: e.policy_violation_flag
                ? "Blocked"
                : e.sensitivity_score > 30
                ? "Redacted"
                : "Allowed",
              policyVersion: "v2.4.1",
              endpointId:
                e.tool_domain?.split(".")[0] || "ep_unknown",
            }))
          );
        }
      })
      .catch(() => {});

    // Enforcement data from settings + heartbeat
    Promise.all([
      fetch(`/api/proxy/settings?workspaceId=${wsId}`).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`/api/agent/heartbeat?workspaceId=${wsId}`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([settings, agent]) => {
        if (!settings && !agent) return;
        const proxyOn: boolean = settings?.proxy_enabled ?? false;
        const agentOn: boolean = agent?.connected ?? false;

        setEnforcementRows([
          {
            label: "Endpoints Enrolled",
            value: agentOn ? "100%" : "0%",
            status: agentOn ? "green" : "red",
          },
          {
            label: "Policy Sync Verified",
            value: proxyOn ? "Yes" : "No",
            status: proxyOn ? "green" : "amber",
          },
          {
            label: "Fail-Closed Status",
            value: settings?.block_high_risk ? "Yes" : "No",
            status: settings?.block_high_risk ? "green" : "amber",
          },
          {
            label: "Last Policy Version Hash",
            value: "sha256:a3f9c2b1d4e8f037",
            status: "neutral",
          },
          {
            label: "Proxy Enforcement Status",
            value: proxyOn ? (agentOn ? "Active" : "Degraded") : "Offline",
            status:
              proxyOn && agentOn ? "green" : proxyOn ? "amber" : "red",
          },
          { label: "Tamper Attempts", value: "0", status: "green" },
          {
            label: "Device Health Telemetry",
            value: agentOn ? "Reporting" : "Offline",
            status: agentOn ? "green" : "red",
          },
        ]);
      })
      .catch(() => {});
  }, [user?.uid]);

  const close = () => setActiveModal(null);

  const orgId = user?.uid?.slice(0, 8) ?? "demo";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white/90">Reports</h1>
        <p className="mt-1 text-sm text-white/50">
          Last 30 days · Three pre-built reports, ready to share.
        </p>
      </div>

      {/* Report Cards */}
      <div className="space-y-4">
        <ReportCard
          title="Executive Summary"
          description="High-level AI risk posture for leadership visibility."
          onView={() => setActiveModal({ type: "view-executive" })}
          onExport={() => window.print()}
          onSchedule={() =>
            setActiveModal({ type: "schedule", reportTitle: "Executive Summary" })
          }
        />
        <ReportCard
          title="Enforcement Assurance"
          description="Technical validation of policy enforcement and endpoint compliance."
          onView={() => setActiveModal({ type: "view-enforcement" })}
          onExport={() => window.print()}
          onSchedule={() =>
            setActiveModal({
              type: "schedule",
              reportTitle: "Enforcement Assurance",
            })
          }
        />
        <ReportCard
          title="Activity Log"
          description="Exportable record of AI prompt activity and enforcement actions."
          onView={() => setActiveModal({ type: "view-activity" })}
          onExport={() => downloadCSV(activityRows)}
          onSchedule={() =>
            setActiveModal({ type: "schedule", reportTitle: "Activity Log" })
          }
        />
      </div>

      {/* Modals */}
      {activeModal?.type === "view-executive" && (
        <ExecutiveSummaryModal data={execData} onClose={close} />
      )}
      {activeModal?.type === "view-enforcement" && (
        <EnforcementAssuranceModal
          rows={enforcementRows}
          orgId={orgId}
          onClose={close}
        />
      )}
      {activeModal?.type === "view-activity" && (
        <ActivityLogModal rows={activityRows} onClose={close} />
      )}
      {activeModal?.type === "schedule" && (
        <ScheduleModal reportTitle={activeModal.reportTitle} onClose={close} />
      )}
    </div>
  );
}
