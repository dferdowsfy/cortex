"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type Step = "input" | "extracting" | "enrichment" | "assessing" | "results" | "error";

interface EnrichmentQuestion {
  question_id: string;
  question: string;
  why_important?: string;
  answer_format: string;
  options?: string[];
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

const TIERS = ["Free", "Basic", "Pro", "Team", "Business", "Enterprise"];

const POPULAR_TOOLS: Record<string, string> = {
  ChatGPT: "OpenAI",
  "GitHub Copilot": "GitHub / Microsoft",
  "Microsoft Copilot": "Microsoft",
  "Google Gemini": "Google",
  "Claude": "Anthropic",
  "Grammarly": "Grammarly Inc.",
  "Notion AI": "Notion Labs",
  "Jasper": "Jasper AI",
  "Otter.ai": "Otter.ai Inc.",
  "Midjourney": "Midjourney Inc.",
  "DALL-E": "OpenAI",
  "Perplexity": "Perplexity AI",
  "Cursor": "Anysphere",
  "Zoom AI": "Zoom",
  "Slack AI": "Salesforce / Slack",
  "Adobe Firefly": "Adobe",
};

function riskBadge(tier: string) {
  const cls: Record<string, string> = {
    critical: "badge-critical",
    high: "badge-high",
    moderate: "badge-moderate",
    low: "badge-low",
  };
  return cls[tier?.toLowerCase()] || "badge-moderate";
}

function generateId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ═══════════════════════════════════════════════════════════════
   Step Indicator
   ═══════════════════════════════════════════════════════════════ */

function StepIndicator({ current }: { current: Step }) {
  const stepMap: Record<string, number> = {
    input: 0,
    extracting: 1,
    enrichment: 1,
    assessing: 2,
    results: 3,
    error: -1,
  };
  const idx = stepMap[current] ?? 0;
  const labels = ["Tool Info", "Enrichment", "Assessment", "Results"];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`step-dot ${i < idx
                ? "step-dot-done"
                : i === idx
                  ? "step-dot-active"
                  : "step-dot-pending"
              }`}
          >
            {i < idx ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          <span
            className={`hidden text-xs font-medium sm:block ${i <= idx ? "text-gray-900" : "text-gray-400"
              }`}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <div
              className={`hidden h-px w-8 sm:block ${i < idx ? "bg-green-400" : "bg-gray-200"
                }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Loading Spinner
   ═══════════════════════════════════════════════════════════════ */

function LoadingState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-16">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
        <svg className="h-6 w-6 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      </div>
      <h3 className="mt-6 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Enrichment Form
   ═══════════════════════════════════════════════════════════════ */

function EnrichmentForm({
  questions,
  answers,
  onChange,
}: {
  questions: EnrichmentQuestion[];
  answers: Record<string, string | string[]>;
  onChange: (id: string, val: string | string[]) => void;
}) {
  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.question_id} className="rounded-lg border border-gray-200 bg-white p-5">
          <label className="block text-sm font-semibold text-gray-800">
            {q.question}
          </label>
          {q.why_important && (
            <p className="mt-1 text-xs text-gray-400">{q.why_important}</p>
          )}

          <div className="mt-3">
            {q.answer_format?.includes("select all") ||
              q.answer_format?.includes("Multi") ? (
              /* ── Checkboxes ── */
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((opt) => {
                  const selected = ((answers[q.question_id] as string[]) || []).includes(opt);
                  return (
                    <label
                      key={opt}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${selected
                          ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => {
                          const prev = (answers[q.question_id] as string[]) || [];
                          onChange(
                            q.question_id,
                            selected ? prev.filter((v) => v !== opt) : [...prev, opt]
                          );
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            ) : q.answer_format?.includes("Yes/No") ? (
              /* ── Yes/No ── */
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${answers[q.question_id] === opt
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    onClick={() => onChange(q.question_id, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : q.options && q.options.length > 0 ? (
              /* ── Radio / Select One ── */
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${answers[q.question_id] === opt
                        ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    onClick={() => onChange(q.question_id, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              /* ── Free Text ── */
              <textarea
                className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                rows={2}
                placeholder="Type your answer..."
                value={(answers[q.question_id] as string) || ""}
                onChange={(e) => onChange(q.question_id, e.target.value)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Results View
   ═══════════════════════════════════════════════════════════════ */

function ResultsView({ data }: { data: Record<string, unknown> }) {
  const profile = (data.profile as Record<string, unknown>) || {};
  const toolProfile = (profile.tool_profile as Record<string, unknown>) || {};
  const classification = (data.classification as Record<string, unknown>) || {};
  const classData = (classification.classification as Record<string, unknown>) || classification;
  const overallRisk = (classData.overall_risk as Record<string, unknown>) || {};
  const dimensions = (classData.dimensions as Record<string, Record<string, unknown>>) || {};
  const governance = (classData.governance_status as Record<string, unknown>) || {};
  const flags = (data.flags as Record<string, unknown>) || {};
  const flagReport = (flags.flag_report as Record<string, unknown>) || flags;
  const flagList = (flagReport.flags as Array<Record<string, unknown>>) || [];
  const recommendations = (data.recommendations as Record<string, unknown>) || {};
  const remPlan = (recommendations.remediation_plan as Record<string, unknown>) || recommendations;
  const strategies = (remPlan.strategies as Array<Record<string, unknown>>) || [];

  const riskTier = (overallRisk.tier || "Unknown") as string;
  const avgScore = (overallRisk.average as number) || 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="card flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {(toolProfile.tool_name as string) || "AI Tool"}
          </h2>
          <p className="text-sm text-gray-500">
            {(toolProfile.vendor as string) || ""} · {(toolProfile.tier as string) || ""}
            {toolProfile.category ? ` · ${toolProfile.category}` : ""}
          </p>
          {!!overallRisk.executive_summary && (
            <p className="mt-2 text-sm text-gray-600">
              {overallRisk.executive_summary as string}
            </p>
          )}
        </div>
        <div className="text-center">
          <span className={`badge text-base px-4 py-2 ${riskBadge(riskTier)}`}>
            {riskTier}
          </span>
          <p className="mt-1 text-xs text-gray-400">
            Score: {avgScore.toFixed(1)} / 5.0
          </p>
        </div>
      </div>

      {/* ── Dimensions ── */}
      <div className="grid gap-4 sm:grid-cols-4">
        {(["data_sensitivity", "decision_impact", "affected_parties", "human_oversight"] as const).map(
          (dim) => {
            const d = dimensions[dim] || {};
            const score = (d.score as number) || 0;
            const pct = (score / 5) * 100;
            const barColor =
              score >= 4
                ? "bg-red-500"
                : score >= 3
                  ? "bg-orange-400"
                  : score >= 2
                    ? "bg-yellow-400"
                    : "bg-green-400";
            return (
              <div key={dim} className="card py-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {dim.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {score}
                  <span className="text-sm font-normal text-gray-400"> / 5</span>
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className={`h-1.5 rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* ── Governance Status ── */}
      {!!governance.level && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700">Governance Status</h3>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {governance.level as string}
          </p>
          {!!governance.justification && (
            <p className="mt-1 text-sm text-gray-600">{governance.justification as string}</p>
          )}
          {(governance.gaps as string[])?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(governance.gaps as string[]).map((gap, i) => (
                <span key={i} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                  {gap}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Flags ── */}
      {flagList.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Risk Flags ({flagList.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {flagList.map((flag) => (
              <div key={flag.flag_id as string} className="flex items-start gap-4 px-5 py-4">
                <span className={`badge mt-0.5 shrink-0 ${riskBadge(flag.severity as string)}`}>
                  {flag.severity as string}
                </span>
                <div>
                  <p className="font-medium text-gray-900">{flag.title as string}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {flag.description as string}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {strategies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Remediation Plan</h3>
          {strategies.map((strat) => (
            <div key={strat.strategy_id as string} className="card">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">
                  {strat.strategy_name as string}
                </h4>
                {!!strat.timeframe && (
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {strat.timeframe as string}
                  </span>
                )}
              </div>
              {!!strat.strategy_goal && (
                <p className="mt-1 text-sm text-gray-500">{strat.strategy_goal as string}</p>
              )}
              <div className="mt-4 space-y-3">
                {((strat.recommendations as Array<Record<string, unknown>>) || []).map((rec) => (
                  <div
                    key={rec.rec_id as string}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-gray-800">{rec.title as string}</p>
                      <span className="ml-2 shrink-0 rounded bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {rec.effort as string}
                      </span>
                    </div>
                    {!!rec.description && (
                      <p className="mt-1 text-sm text-gray-600">{rec.description as string}</p>
                    )}
                    {(rec.steps as string[])?.length > 0 && (
                      <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600">
                        {(rec.steps as string[]).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-4">
        <Link href="/" className="btn-secondary">
          ← Back to Dashboard
        </Link>
        <Link href="/report" className="btn-primary">
          Generate Board Report
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Scan Page
   ═══════════════════════════════════════════════════════════════ */

export default function ScanPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("input");
  const [toolName, setToolName] = useState("");
  const [vendor, setVendor] = useState("");
  const [tier, setTier] = useState("Free");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [enrichmentAnswers, setEnrichmentAnswers] = useState<Record<string, string | string[]>>({});
  const [assessment, setAssessment] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  /* ── Pre-fill from query params (from discovery) ── */
  useEffect(() => {
    const qTool = searchParams.get("tool");
    const qVendor = searchParams.get("vendor");
    const qTier = searchParams.get("tier");
    if (qTool) setToolName(qTool);
    if (qVendor) setVendor(qVendor);
    if (qTier && TIERS.includes(qTier)) setTier(qTier);
  }, [searchParams]);

  /* ── Auto-populate vendor ── */
  const handleToolNameChange = useCallback(
    (val: string) => {
      setToolName(val);
      if (val.length < 2) {
        setSuggestions([]);
        return;
      }
      const matches = Object.keys(POPULAR_TOOLS).filter((t) =>
        t.toLowerCase().includes(val.toLowerCase())
      );
      setSuggestions(matches.slice(0, 5));
    },
    []
  );

  function selectSuggestion(name: string) {
    setToolName(name);
    setVendor(POPULAR_TOOLS[name] || "");
    setSuggestions([]);
  }

  /* ── Step 1: Extract ── */
  async function startExtraction() {
    if (!toolName.trim() || !vendor.trim()) return;
    setStep("extracting");
    setError("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_name: toolName, vendor, tier }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setProfile(data);
      setStep("enrichment");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStep("error");
    }
  }

  /* ── Step 2: Assess ── */
  async function startAssessment() {
    setStep("assessing");
    setError("");
    try {
      const questions = (profile?.enrichment_questions as Array<Record<string, string>>) || [];
      const formattedAnswers = questions.map((q) => ({
        question_id: q.question_id,
        question: q.question,
        answer: enrichmentAnswers[q.question_id] || "Not answered",
      }));

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          enrichment_answers: formattedAnswers,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const data = await res.json();

      const fullAssessment = {
        profile,
        classification: data.classification,
        flags: data.flags,
        recommendations: data.recommendations,
      };
      setAssessment(fullAssessment);

      /* persist to localStorage */
      const toolId = generateId();
      const toolProfile = (profile?.tool_profile as Record<string, unknown>) || {};
      const classData =
        ((data.classification?.classification as Record<string, unknown>) || data.classification) as Record<
          string,
          unknown
        >;
      const overallRisk = (classData?.overall_risk as Record<string, unknown>) || {};
      const flagReport =
        ((data.flags?.flag_report as Record<string, unknown>) || data.flags) as Record<string, unknown>;
      const flagList = (flagReport?.flags as unknown[]) || [];
      const remPlan =
        ((data.recommendations?.remediation_plan as Record<string, unknown>) ||
          data.recommendations) as Record<string, unknown>;
      const recs = ((remPlan?.strategies as Array<Record<string, unknown>>) || []).flatMap(
        (s) => (s.recommendations as unknown[]) || []
      );

      const storedTool = {
        id: toolId,
        tool_name: (toolProfile.tool_name as string) || toolName,
        vendor: (toolProfile.vendor as string) || vendor,
        tier: (toolProfile.tier as string) || tier,
        category: (toolProfile.category as string) || "",
        risk_tier: (overallRisk.tier as string) || "Unknown",
        governance_status:
          ((classData?.governance_status as Record<string, unknown>)?.level as string) || "Unknown",
        flag_count: flagList.length,
        rec_count: recs.length,
        scanned_at: new Date().toISOString(),
      };

      const existing = JSON.parse(localStorage.getItem("complyze_tools") || "[]");
      localStorage.setItem("complyze_tools", JSON.stringify([...existing, storedTool]));
      localStorage.setItem(`complyze_assessment_${toolId}`, JSON.stringify(fullAssessment));

      setStep("results");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Assessment failed");
      setStep("error");
    }
  }

  /* ── Render ── */
  return (
    <div className="mx-auto max-w-3xl">
      <StepIndicator current={step} />

      {/* ── INPUT STEP ── */}
      {step === "input" && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900">Scan an AI Tool</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter the AI tool you want to assess. We&apos;ll analyze its risk
            profile and generate compliance recommendations.
          </p>

          <div className="mt-6 space-y-4">
            {/* Tool Name */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">
                Tool Name
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. ChatGPT, Microsoft Copilot, Grammarly..."
                value={toolName}
                onChange={(e) => handleToolNameChange(e.target.value)}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                      onClick={() => selectSuggestion(s)}
                    >
                      <span className="font-medium">{s}</span>
                      <span className="text-xs text-gray-400">
                        {POPULAR_TOOLS[s]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Vendor
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. OpenAI, Microsoft, Google..."
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>

            {/* Tier */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Subscription Tier
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${tier === t
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    onClick={() => setTier(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn-primary mt-4 w-full"
              disabled={!toolName.trim() || !vendor.trim()}
              onClick={startExtraction}
            >
              Start Scan
            </button>
          </div>
        </div>
      )}

      {/* ── EXTRACTING ── */}
      {step === "extracting" && (
        <LoadingState
          title={`Analyzing ${toolName}...`}
          subtitle="Extracting intelligence profile and generating enrichment questions. This typically takes 15-30 seconds."
        />
      )}

      {/* ── ENRICHMENT STEP ── */}
      {step === "enrichment" && profile && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900">
              Tell us about your usage
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              These questions help us tailor the risk assessment to your
              organization&apos;s specific context. You can skip any you&apos;re not sure about.
            </p>
          </div>

          <EnrichmentForm
            questions={
              (profile.enrichment_questions as EnrichmentQuestion[]) || []
            }
            answers={enrichmentAnswers}
            onChange={(id, val) =>
              setEnrichmentAnswers((prev) => ({ ...prev, [id]: val }))
            }
          />

          <div className="flex gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                setStep("input");
                setProfile(null);
              }}
            >
              ← Back
            </button>
            <button className="btn-primary flex-1" onClick={startAssessment}>
              Complete Assessment
            </button>
          </div>
        </div>
      )}

      {/* ── ASSESSING ── */}
      {step === "assessing" && (
        <LoadingState
          title="Running full assessment..."
          subtitle="Classifying risk, generating flags, and building remediation plan. This takes 30-60 seconds."
        />
      )}

      {/* ── RESULTS ── */}
      {step === "results" && assessment && <ResultsView data={assessment} />}

      {/* ── ERROR ── */}
      {step === "error" && (
        <div className="card border-red-200 bg-red-50">
          <h3 className="text-lg font-semibold text-red-800">
            Something went wrong
          </h3>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            className="btn-secondary mt-4"
            onClick={() => setStep("input")}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
