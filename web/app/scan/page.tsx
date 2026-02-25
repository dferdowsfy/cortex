"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ShieldCheck } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Types & Consts
   ═══════════════════════════════════════════════════════════════ */

type Step = "input" | "extracting" | "enrichment" | "assessing" | "results" | "error";

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
    critical: "bg-red-500/10 text-red-500 border border-red-500/20",
    high: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    moderate: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    low: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  };
  return cls[tier?.toLowerCase()] || "bg-zinc-800 text-white/50 border border-white/10";
}

/* ═══════════════════════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════════════════════ */

function LoadingState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl flex flex-col items-center justify-center py-20 px-8 text-center animate-pulse">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/20 mb-8" />
      <h3 className="text-xl font-black text-white/90 tracking-tight uppercase">{title}</h3>
      <p className="mt-3 text-sm text-white/30 max-w-sm leading-relaxed font-bold tracking-widest">{subtitle}</p>
    </div>
  );
}

function ResultsView({ data }: { data: Record<string, unknown> }) {
  const profile = (data.profile as Record<string, unknown>) || {};
  const toolProfile = (profile.tool_profile as Record<string, unknown>) || {};
  const classification = (data.classification as Record<string, unknown>) || {};
  const overallRisk = (classification.overall_risk as Record<string, unknown>) || {};
  const dimensions = (classification.dimensions as Record<string, Record<string, unknown>>) || {};
  const flags = (data.flags as Record<string, unknown>) || {};
  const flagList = (flags.flags as Array<Record<string, unknown>>) || [];
  const recommendations = (data.recommendations as Record<string, unknown>) || {};
  const strategies = (recommendations.strategies as Array<Record<string, unknown>>) || [];

  const riskTier = (overallRisk.tier || "Unknown") as string;
  const avgScore = (overallRisk.average as number) || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Tool Header */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 flex items-center justify-between group">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">
            {(toolProfile.tool_name as string) || "AI Tool"}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs font-black text-white/40 uppercase tracking-widest">{(toolProfile.vendor as string) || "Unknown Vendor"}</span>
            <span className="text-zinc-800 font-black">/</span>
            <span className="text-xs font-black text-white/40 uppercase tracking-widest">{(toolProfile.tier as string) || "Enterprise"}</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-xl ${riskBadge(riskTier)}`}>
            {riskTier} Risk
          </span>
          <p className="mt-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
            Composite score: {avgScore.toFixed(1)} / 5.0
          </p>
        </div>
      </div>

      {/* Dim Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {(["data_sensitivity", "decision_impact", "affected_parties", "human_oversight"] as const).map((dim) => {
          const d = dimensions[dim] || {};
          const score = (d.score as number) || 0;
          return (
            <div key={dim} className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-4 h-8">
                {dim.replace(/_/g, " ")}
              </p>
              <div className="flex justify-between items-end mb-2">
                <p className="text-3xl font-black text-white tabular-nums">{score}</p>
                <span className="text-[10px] font-black text-white/10 mb-1">/ 5</span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${score >= 4 ? "bg-red-500" : score >= 3 ? "bg-orange-500" : "bg-emerald-500"}`}
                  style={{ width: `${(score / 5) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Findings */}
      {flagList.length > 0 && (
        <section className="bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01]">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Critical Risk Findings</h3>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {flagList.map((flag, i) => (
              <div key={i} className="p-6 flex items-start gap-6 hover:bg-white/[0.01] transition-colors">
                <span className={`mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${riskBadge(flag.severity as string)}`}>
                  {flag.severity as string}
                </span>
                <div>
                  <p className="font-black text-white/80 text-sm tracking-tight uppercase">{flag.title as string}</p>
                  <p className="mt-1 text-xs text-white/30 leading-relaxed font-bold italic">{flag.description as string}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Hub */}
      <div className="flex items-center justify-between pt-10 border-t border-[var(--border-main)]">
        <Link href="/dashboard" className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest hover:text-[var(--text-primary)] transition-colors">
          ← Operational Dashboard
        </Link>
        <button className="btn-secondary px-10">
          Export Audit Payload
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export default function AssessPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("input");
  const [toolName, setToolName] = useState("");
  const [vendor, setVendor] = useState("");
  const [tier, setTier] = useState("Free");
  const [profile, setProfile] = useState<any>(null);
  const [enrichmentAnswers, setEnrichmentAnswers] = useState<Record<string, any>>({});
  const [assessment, setAssessment] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const qTool = searchParams.get("tool");
    const qVendor = searchParams.get("vendor");
    const qTier = searchParams.get("tier");
    if (qTool) setToolName(qTool);
    if (qVendor) setVendor(qVendor);
    if (qTier && TIERS.includes(qTier)) setTier(qTier);
  }, [searchParams]);

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
      const data = await res.json();
      setProfile(data);
      setStep("enrichment");
    } catch (e: any) {
      setError(e.message || "Extraction failed");
      setStep("error");
    }
  }

  async function startAssessment() {
    setStep("assessing");
    try {
      const questions = (profile?.enrichment_questions as any[]) || [];
      const formattedAnswers = questions.map((q) => ({
        question_id: q.question_id,
        question: q.question,
        answer: enrichmentAnswers[q.question_id] || "Not answered",
      }));

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, enrichment_answers: formattedAnswers }),
      });
      const data = await res.json();
      setAssessment({ profile, ...data });
      setStep("results");
    } catch (e: any) {
      setError(e.message || "Assessment failed");
      setStep("error");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 min-h-screen">

      {/* Simplified Tool Evaluation Mode */}
      <header className="mb-12 border-b border-[var(--border-main)] pb-8">
        <h1 className="text-sm font-black text-muted uppercase tracking-[0.3em]">AI Tool Assessment</h1>
        <p className="text-secondary text-xs font-bold mt-2 uppercase tracking-widest italic leading-relaxed">Evaluating external AI intelligence for enterprise safety alignment.</p>
      </header>

      {/* INPUT STEP */}
      {step === "input" && (
        <div className="card p-12 shadow-2xl border-none ring-1 ring-[var(--border-main)]">
          <div className="flex justify-between items-center mb-12">
            <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-white">
              AI Tool Assessment
            </h1>
            <ShieldCheck className="w-10 h-10 text-[var(--brand-color)]" />
          </div>

          <div className="space-y-12">
            <div>
              <label className="text-[12px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-4 block font-mono">Select Target Application</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.keys(POPULAR_TOOLS).map(tool => (
                  <button
                    key={tool}
                    onClick={() => { setToolName(tool); setVendor(POPULAR_TOOLS[tool]); }}
                    className={`px-6 py-4 rounded-xl text-[12px] font-bold uppercase tracking-tight text-left transition-all border ${toolName === tool
                      ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)] shadow-lg"
                      : "bg-[var(--bg-card-hover)] text-[var(--text-secondary)] border-transparent hover:border-[var(--border-main)]"}`}
                  >
                    {tool}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-[12px] font-black text-[var(--text-muted)] uppercase tracking-widest block font-mono">Tool / Service Name</label>
                <input
                  type="text"
                  value={toolName}
                  onChange={e => setToolName(e.target.value)}
                  placeholder="e.g. OpenAI o3-mini"
                  className="w-full bg-[var(--bg-card-hover)] border border-[var(--border-main)] rounded-xl px-6 py-4 text-base font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)]/20 transition-all placeholder:text-[var(--text-muted)]/50"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[12px] font-black text-[var(--text-muted)] uppercase tracking-widest block font-mono">Authorized Vendor</label>
                <input
                  type="text"
                  value={vendor}
                  onChange={e => setVendor(e.target.value)}
                  placeholder="e.g. Anthropic"
                  className="w-full bg-[var(--bg-card-hover)] border border-[var(--border-main)] rounded-xl px-6 py-4 text-base font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)]/20 transition-all placeholder:text-[var(--text-muted)]/50"
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 block font-mono">Provisioning Tier</label>
              <div className="flex flex-wrap gap-4">
                {TIERS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    className={`px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] transition-all border ${tier === t
                      ? "bg-[var(--brand-color)] text-white border-[var(--brand-color)] shadow-xl"
                      : "bg-[var(--bg-card-hover)] text-[var(--text-muted)] border-transparent hover:border-[var(--border-main)]"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-8 border-t border-[var(--border-soft)]">
              <button
                onClick={startExtraction}
                disabled={!toolName || !vendor}
                className="btn-primary w-full py-6 text-lg shadow-2xl active:scale-[0.98]"
              >
                Scan Tool & Analyze Risk Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "extracting" && (
        <LoadingState title="Extracting Profile" subtitle="Harvesting public compliance data and intelligence architecture..." />
      )}

      {step === "enrichment" && profile && (
        <div className="space-y-8 animate-in slide-in-from-bottom-5">
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-10">
            <h2 className="text-xl font-black text-white italic tracking-tight uppercase">Operational Context Enrichment</h2>
            <p className="mt-2 text-xs text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">We require specific usage Intent to calibrate the assessment score.</p>
          </div>

          <div className="space-y-6">
            {(profile.enrichment_questions as any[] || []).map(q => (
              <div key={q.question_id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 space-y-4">
                <label className="text-sm font-bold text-white/90 leading-relaxed uppercase tracking-tight">{q.question}</label>
                <textarea
                  className="w-full bg-white/5 border border-white/5 rounded-xl p-4 text-xs font-bold text-white/60 focus:outline-none focus:border-white/20 transition-all placeholder:text-zinc-800"
                  rows={2}
                  placeholder="Contextual response..."
                  value={enrichmentAnswers[q.question_id] || ""}
                  onChange={(e) => setEnrichmentAnswers(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button onClick={() => setStep("input")} className="text-[10px] font-black text-white/30 uppercase tracking-widest hover:text-white/60 px-6 py-4">← Reconfigure</button>
            <button onClick={startAssessment} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-[0.2em] py-4 rounded-xl text-xs transition-all shadow-xl shadow-blue-900/20">Finalize Evaluation</button>
          </div>
        </div>
      )}

      {step === "assessing" && (
        <LoadingState title="Analyzing Risk" subtitle="Cross-referencing behavior with safety standards and generating flags..." />
      )}

      {step === "results" && assessment && <ResultsView data={assessment} />}

      {step === "error" && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-10 text-center">
          <h3 className="text-xl font-black text-red-500 uppercase italic">Assessment Interrupted</h3>
          <p className="mt-2 text-xs text-red-400/60 font-bold italic tracking-wide">{error}</p>
          <button className="mt-8 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] underline" onClick={() => setStep("input")}>Restart Engine</button>
        </div>
      )}
    </div>
  );
}
