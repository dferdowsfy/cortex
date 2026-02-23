"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface StoredTool {
  id: string;
  tool_name: string;
  vendor: string;
  tier: string;
  risk_tier: string;
  flag_count: number;
  rec_count: number;
}

type ReportStep = "form" | "generating" | "done" | "error";

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function loadTools(): StoredTool[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("complyze_tools") || "[]");
  } catch {
    return [];
  }
}

function loadAssessment(id: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`complyze_assessment_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function riskBadge(tier: string) {
  const cls: Record<string, string> = {
    critical: "badge-critical",
    high: "badge-high",
    moderate: "badge-moderate",
    low: "badge-low",
  };
  return cls[tier?.toLowerCase()] || "badge-moderate";
}

/* ═══════════════════════════════════════════════════════════════
   Narrative Section
   ═══════════════════════════════════════════════════════════════ */

function NarrativeBlock({
  title,
  content,
  icon,
}: {
  title: string;
  content: string;
  icon: string;
}) {
  return (
    <div className="border-b border-gray-100 pb-6 last:border-0">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <span>{icon}</span> {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-800 whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Report Display
   ═══════════════════════════════════════════════════════════════ */

function ReportDisplay({ report }: { report: Record<string, unknown> }) {
  const summary =
    (report.board_summary as Record<string, unknown>) || report;
  const meta =
    (summary.report_metadata as Record<string, unknown>) || {};
  const snapshot =
    (summary.portfolio_snapshot as Record<string, unknown>) || {};
  const narrative =
    (summary.narrative as Record<string, unknown>) || {};
  const appendix =
    (summary.appendix_data as Record<string, unknown>) || {};

  const tiers =
    (snapshot.tools_by_risk_tier as Record<string, number>) || {};
  const govStatus =
    (snapshot.tools_by_governance_status as Record<string, number>) ||
    {};
  const toolTable =
    (appendix.tool_summary_table as Array<Record<string, unknown>>) ||
    [];

  /* Critical & High findings */
  const critFindings =
    (narrative.critical_and_high_findings as Record<string, unknown>) ||
    {};
  const findingsDetail =
    (critFindings.findings_detail as Array<Record<string, unknown>>) ||
    [];

  /* Leadership action items */
  const leadership =
    (narrative.leadership_action_items as Record<string, unknown>) || {};
  const actionItems =
    (leadership.action_items as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-8 print:space-y-6">
      {/* ── Report Title ── */}
      <div className="card bg-gray-900 text-white print:bg-white print:text-black print:border">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-300 print:text-gray-500 uppercase tracking-wide">
              AI Risk Posture Report
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {(meta.company_name as string) || "Organization"}
            </h1>
            <p className="mt-1 text-sm text-gray-300 print:text-gray-500">
              {(meta.report_period as string) || "Current Period"} ·{" "}
              {(meta.report_type as string) || "Ad Hoc"}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print rounded-lg border border-gray-500 bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
          >
            Print / PDF
          </button>
        </div>
      </div>

      {/* ── Portfolio Snapshot ── */}
      <div className="card">
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          Portfolio Snapshot
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-brand-600">
              {(snapshot.total_tools_registered as number) || 0}
            </p>
            <p className="text-xs font-medium text-gray-600">Tools Registered</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-600">
              {(tiers.critical || 0) + (tiers.high || 0)}
            </p>
            <p className="text-xs font-medium text-gray-600">Critical + High</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-600">
              {tiers.moderate || 0}
            </p>
            <p className="text-xs font-medium text-gray-600">Moderate</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {tiers.low || 0}
            </p>
            <p className="text-xs font-medium text-gray-600">Low</p>
          </div>
        </div>

        {/* Risk tier bar */}
        <div className="mt-4">
          <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
            {(["critical", "high", "moderate", "low"] as const).map((t) => {
              const total =
                (snapshot.total_tools_registered as number) || 1;
              const count = tiers[t] || 0;
              const pct = (count / total) * 100;
              const colors: Record<string, string> = {
                critical: "bg-red-500",
                high: "bg-orange-400",
                moderate: "bg-yellow-400",
                low: "bg-green-400",
              };
              return pct > 0 ? (
                <div
                  key={t}
                  className={`${colors[t]}`}
                  style={{ width: `${pct}%` }}
                />
              ) : null;
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-600 font-medium">
            <span>{tiers.critical || 0} Critical</span>
            <span>{tiers.high || 0} High</span>
            <span>{tiers.moderate || 0} Moderate</span>
            <span>{tiers.low || 0} Low</span>
          </div>
        </div>

        {/* Governance breakdown */}
        {Object.keys(govStatus).length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Governance Status
            </p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(govStatus).map(([status, count]) => (
                <span
                  key={status}
                  className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700"
                >
                  {status.replace(/_/g, " ")}:{" "}
                  <strong>{count as number}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Narrative Sections ── */}
      <div className="card space-y-6">
        <h2 className="text-lg font-bold text-gray-900">
          Executive Narrative
        </h2>

        {!!narrative.executive_overview && (
          <NarrativeBlock
            icon="📋"
            title="Executive Overview"
            content={narrative.executive_overview as string}
          />
        )}
        {!!narrative.portfolio_overview && (
          <NarrativeBlock
            icon="🗂️"
            title="Portfolio Overview"
            content={narrative.portfolio_overview as string}
          />
        )}
        {!!narrative.risk_posture_analysis && (
          <NarrativeBlock
            icon="📊"
            title="Risk Posture Analysis"
            content={narrative.risk_posture_analysis as string}
          />
        )}
      </div>

      {/* ── Critical & High Findings ── */}
      {findingsDetail.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Critical &amp; High Findings
          </h2>
          {!!critFindings.narrative && (
            <p className="text-sm text-gray-600 mb-4">
              {critFindings.narrative as string}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Tool</th>
                  <th className="pb-2 pr-4">Finding</th>
                  <th className="pb-2 pr-4">Severity</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {findingsDetail.map((f, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 font-medium text-gray-900">
                      {f.tool_name as string}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {f.flag_title as string}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`badge ${riskBadge(
                          f.flag_severity as string
                        )}`}
                      >
                        {f.flag_severity as string}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {f.remediation_status as string}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Remediation & Outlook ── */}
      <div className="card space-y-6">
        {!!narrative.remediation_progress && (
          <NarrativeBlock
            icon="🔧"
            title="Remediation Progress"
            content={narrative.remediation_progress as string}
          />
        )}
        {!!narrative.outlook_and_next_steps && (
          <NarrativeBlock
            icon="🔮"
            title="Outlook & Next Steps"
            content={narrative.outlook_and_next_steps as string}
          />
        )}
      </div>

      {/* ── Leadership Action Items ── */}
      {actionItems.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Leadership Action Items
          </h2>
          {!!leadership.narrative && (
            <p className="text-sm text-gray-600 mb-4">
              {leadership.narrative as string}
            </p>
          )}
          <div className="space-y-3">
            {actionItems.map((item) => {
              const urgencyColor: Record<string, string> = {
                Immediate: "bg-red-100 text-red-800",
                "Next 30 Days": "bg-orange-100 text-orange-800",
                "Next Quarter": "bg-yellow-100 text-yellow-800",
                Informational: "bg-gray-100 text-gray-700",
              };
              return (
                <div
                  key={item.action_id as string}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-gray-900">
                      {item.description as string}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${urgencyColor[(item.urgency as string) || ""] ||
                        "bg-gray-100 text-gray-700"
                        }`}
                    >
                      {item.urgency as string}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {!!item.estimated_cost && (
                      <span>Est. cost: {item.estimated_cost as string}</span>
                    )}
                    {!!item.action_type && (
                      <span>Type: {item.action_type as string}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Appendix: Tool Table ── */}
      {toolTable.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Appendix: Tool Summary
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="pb-2 pr-3">Tool</th>
                  <th className="pb-2 pr-3">Vendor</th>
                  <th className="pb-2 pr-3">Tier</th>
                  <th className="pb-2 pr-3">Risk</th>
                  <th className="pb-2 pr-3">Governance</th>
                  <th className="pb-2 pr-3">Flags</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {toolTable.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-medium text-gray-900">
                      {t.tool_name as string}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {t.vendor as string}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {t.tier as string}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`badge ${riskBadge(
                          t.risk_tier as string
                        )}`}
                      >
                        {t.risk_tier as string}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {t.governance_status as string}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">
                      {t.active_flags as number}
                    </td>
                    <td className="py-2 text-gray-600">
                      {t.remediation_status as string}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="no-print flex gap-3">
        <Link href="/" className="btn-secondary">
          ← Back to Dashboard
        </Link>
        <button onClick={() => window.print()} className="btn-primary">
          Print / Download as PDF
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Report Page
   ═══════════════════════════════════════════════════════════════ */

export default function ReportPage() {
  const [tools, setTools] = useState<StoredTool[]>([]);
  const [step, setStep] = useState<ReportStep>("form");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportType, setReportType] = useState("Quarterly");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) {
      setTools(loadTools());
      setHistory(JSON.parse(localStorage.getItem("complyze_reports") || "[]"));
      /* Default report period */
      const now = new Date();
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      setReportPeriod(`Q${quarter} ${now.getFullYear()}`);
      initialLoadDone.current = true;
    }
  }, []);

  async function generateReport() {
    if (!companyName.trim()) return;
    setStep("generating");
    setError("");

    try {
      /* Load full assessments for all tools */
      const assessments = tools
        .map((t) => loadAssessment(t.id))
        .filter(Boolean);

      if (assessments.length === 0) {
        throw new Error(
          "No assessment data found. Please scan at least one tool first."
        );
      }

      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization: {
            company_name: companyName,
            industry,
            employee_count: parseInt(employeeCount, 10) || 100,
            report_period: reportPeriod,
            report_type: reportType,
          },
          assessments,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      const newReportEntry = {
        id: `report_${Date.now()}`,
        name: `${companyName} - ${reportType} Report`,
        date: new Date().toISOString(),
        toolsIncluded: assessments.length,
        data: data
      };

      const existingReports = JSON.parse(localStorage.getItem("complyze_reports") || "[]");
      const updatedHistory = [newReportEntry, ...existingReports];
      localStorage.setItem("complyze_reports", JSON.stringify(updatedHistory));
      setHistory(updatedHistory);

      setReport(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Report generation failed");
      setStep("error");
    }
  }

  /* ── Empty state ── */
  if (tools.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No tools to report on
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Scan at least one AI tool before generating a board report.
          </p>
          <Link href="/scan" className="btn-primary mt-6">
            Scan Your First Tool
          </Link>
        </div>
      </div>
    );
  }

  /* ── Form ── */
  if (step === "form") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white/90">
            Generate Board Report
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Create a board-ready AI risk posture report based on{" "}
            {tools.length} scanned {tools.length === 1 ? "tool" : "tools"}.
          </p>
        </div>

        {/* Tools to include */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Tools Included ({tools.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <span
                key={t.id}
                className={`badge ${riskBadge(t.risk_tier)}`}
              >
                {t.tool_name}
              </span>
            ))}
          </div>
        </div>

        {/* Org info */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Organization Details
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Name *
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="e.g. Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Industry
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Financial Services"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Employee Count
              </label>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. 500"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Report Period
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Q1 2025"
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Report Type
              </label>
              <div className="mt-1 flex gap-2">
                {["Monthly", "Quarterly", "Ad Hoc"].map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${reportType === rt
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    onClick={() => setReportType(rt)}
                  >
                    {rt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn-primary w-full"
          disabled={!companyName.trim()}
          onClick={generateReport}
        >
          Generate Board Report
        </button>

        {/* Report History */}
        {history.length > 0 && (
          <div className="card mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Report History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-2 pr-3">Report Name</th>
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3 text-center">Tools Included</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td className="py-3 pr-3 font-medium text-gray-900">{h.name}</td>
                      <td className="py-3 pr-3 text-gray-600">{new Date(h.date).toLocaleDateString()}</td>
                      <td className="py-3 pr-3 text-gray-600 text-center">{h.toolsIncluded}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => { setReport(h.data); setStep("done"); }}
                          className="text-brand-600 hover:text-brand-700 font-medium"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Generating ── */
  if (step === "generating") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card flex flex-col items-center justify-center py-16">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
            <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="mt-6 text-lg font-semibold text-gray-900">
            Generating Board Report...
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Composing executive narrative for {tools.length}{" "}
            {tools.length === 1 ? "tool" : "tools"}. This takes 30-60 seconds.
          </p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (step === "error") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card border-red-200 bg-red-50">
          <h3 className="text-lg font-semibold text-red-800">
            Report generation failed
          </h3>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            className="btn-secondary mt-4"
            onClick={() => setStep("form")}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /* ── Report Display ── */
  if (step === "done" && report) {
    return <ReportDisplay report={report} />;
  }

  return null;
}
