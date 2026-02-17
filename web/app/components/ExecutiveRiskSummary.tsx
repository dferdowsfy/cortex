"use client";

/* ── Executive Risk Summary ──────────────────────────────────────
   Single wide panel: governance coverage, active agents,
   unassessed assets, open actions, one-sentence summary.
   Clean, board-ready. */

interface ExecSummaryProps {
    governanceCoverage: number;
    activeAgents: number;
    unassessedAssets: number;
    openActions: number;
    totalAssets: number;
    criticalCount: number;
}

function CircularProgress({ percent }: { percent: number }) {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="relative h-20 w-20 flex-shrink-0">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                <circle
                    cx="40" cy="40" r={radius}
                    fill="none" stroke="#f3f4f6" strokeWidth="5"
                />
                <circle
                    cx="40" cy="40" r={radius}
                    fill="none" stroke="#6366f1" strokeWidth="5"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-900">{percent}%</span>
            </div>
        </div>
    );
}

function Metric({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
    return (
        <div className="text-center">
            <p className={`text-3xl font-bold tracking-tight ${alert ? "text-red-600" : "text-gray-900"}`}>
                {value}
            </p>
            <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wide">{label}</p>
        </div>
    );
}

export default function ExecutiveRiskSummary({
    governanceCoverage,
    activeAgents,
    unassessedAssets,
    openActions,
    totalAssets,
    criticalCount,
}: ExecSummaryProps) {
    // Generate dynamic one-sentence summary
    const summary = generateSummary(totalAssets, unassessedAssets, criticalCount, openActions);

    return (
        <section className="bg-white border border-gray-200 rounded-lg p-8 mb-10">
            <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase mb-6">
                Enterprise AI Risk Exposure
            </h2>

            <div className="flex flex-col lg:flex-row items-center gap-10">
                {/* Governance Coverage Ring */}
                <div className="flex items-center gap-5">
                    <CircularProgress percent={governanceCoverage} />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Governance Coverage</p>
                        <p className="text-xs text-gray-500 mt-0.5">Assessed vs. total assets</p>
                    </div>
                </div>

                <div className="hidden lg:block h-16 w-px bg-gray-200" />

                {/* Key Metrics */}
                <div className="flex items-center gap-10 flex-1 justify-center">
                    <Metric label="Active Agents" value={activeAgents} />
                    <Metric label="Unassessed Assets" value={unassessedAssets} alert={unassessedAssets > 0} />
                    <Metric label="Open Actions" value={openActions} alert={openActions > 0} />
                </div>
            </div>

            {/* Dynamic Summary */}
            <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-sm text-gray-600 leading-relaxed">
                    {summary}
                </p>
            </div>
        </section>
    );
}

function generateSummary(
    total: number,
    unassessed: number,
    critical: number,
    actions: number
): string {
    const parts: string[] = [];

    if (total === 0) {
        return "No AI services have been registered. Run a discovery scan or register tools to begin risk assessment.";
    }

    parts.push(`${total} AI service${total !== 1 ? "s" : ""} detected`);

    if (critical > 0) {
        parts.push(`${critical} classified as critical risk`);
    }

    if (unassessed > 0) {
        parts.push(`${unassessed} require${unassessed === 1 ? "s" : ""} immediate governance review`);
    } else if (actions > 0) {
        parts.push(`${actions} open action${actions !== 1 ? "s" : ""} pending resolution`);
    }

    if (unassessed === 0 && critical === 0 && actions === 0) {
        parts.push("all assets are governed with no outstanding actions");
    }

    return parts.join(". ") + ".";
}
