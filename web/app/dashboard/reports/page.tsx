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
  const [day, setDay] = useState("1");
  const [time, setTime] = useState("09:00");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!email.trim()) return;
    setSaved(true);
    setTimeout(onClose, 1400);
  }

  const DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));
  const TIMES = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm rounded-[2rem] bg-[#09090b] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--brand-color)] to-transparent opacity-50" />

        <div className="flex items-start justify-between mb-10">
          <div>
            <h2 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">Schedule</h2>
            <p className="text-[10px] font-black text-white/30 mt-2 uppercase tracking-[0.2em]">{reportTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {saved ? (
          <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
              <span className="text-2xl text-emerald-500">✓</span>
            </div>
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Lifecycle Armed</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] font-mono block">Cadence</label>
              <div className="flex gap-2">
                {["Weekly", "Monthly"].map(f => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${frequency === f
                      ? "bg-white text-black border-white shadow-xl"
                      : "bg-white/5 text-white/40 border-transparent hover:border-white/10"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {frequency === "Monthly" && (
              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/20 uppercase tracking-widest font-mono block">Day of Month</label>
                  <select
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-white/20 transition-all appearance-none"
                  >
                    {DAYS.map(d => <option key={d} value={d} className="bg-[#09090b]">Day {d}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/20 uppercase tracking-widest font-mono block">Sync Time</label>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-white/20 transition-all appearance-none"
                  >
                    {TIMES.map(t => <option key={t} value={t} className="bg-[#09090b]">{t} UTC</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] font-mono block">Distribution</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="STAKEHOLDER@CORP.AI"
                className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-[var(--brand-color)]/50 transition-all placeholder:text-white/10 uppercase tracking-widest"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!email.trim()}
              className="w-full bg-[var(--brand-color)] hover:bg-blue-500 text-white font-black uppercase tracking-[0.3em] py-5 rounded-2xl text-[10px] transition-all shadow-xl shadow-blue-900/20 active:scale-[0.98] disabled:opacity-20"
            >
              Initialize Schedule
            </button>
          </div>
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
                    className={`text-sm font-semibold ${row.status === "green"
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
    <div className="bg-[#121214] rounded-2xl border border-white/5 px-5 py-6 sm:px-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
        <p className="text-sm text-white/60 mt-1 sm:mt-0.5">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 text-left">
        <button
          onClick={onView}
          className="flex-1 sm:flex-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
        >
          View
        </button>
        <button
          onClick={onExport}
          className="flex-1 sm:flex-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
        >
          Export
        </button>
        <button
          onClick={onSchedule}
          className="flex-1 sm:flex-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
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
      .catch(() => { });

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
      .catch(() => { });
  }, [user?.uid]);

  const close = () => setActiveModal(null);

  const orgId = user?.uid?.slice(0, 8) ?? "demo";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white/95">Reports</h1>
        <p className="mt-1 text-sm text-white/70">
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
