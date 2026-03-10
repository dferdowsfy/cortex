export type ExecutionMode = "manual" | "scheduled";
export type ValidationEnvironment = "production" | "staging";
export type ValidationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LIMITATION";
export type ValidationStatus = "PASS" | "WARN" | "FAIL";

export interface ProxyValidationSkillInput {
  mode: ExecutionMode;
  notify: boolean;
  environment?: ValidationEnvironment;
}

export interface ValidationFinding {
  id: string;
  title: string;
  severity: ValidationSeverity;
  details?: string;
  component?: string;
}

export interface ValidationReport {
  environment: ValidationEnvironment;
  generatedAt: string;
  score: number;
  status: ValidationStatus;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  limitationCount: number;
  findings: ValidationFinding[];
  executiveHtml: string;
}

export interface SkillResult {
  report: ValidationReport;
  emailed: boolean;
  executionTimeMs: number;
}

interface ValidationEngineResponse {
  findings?: Array<Partial<ValidationFinding>>;
  generatedAt?: string;
}

const SCORE_DEDUCTIONS: Record<ValidationSeverity, number> = {
  CRITICAL: 30,
  HIGH: 15,
  MEDIUM: 5,
  LIMITATION: 0,
};

function resolveEnvironment(input?: ValidationEnvironment): ValidationEnvironment {
  if (input) return input;
  const fromEnv = process.env.COMPLYZE_ENVIRONMENT;
  return fromEnv === "production" || fromEnv === "staging" ? fromEnv : "production";
}

function normalizeSeverity(value: unknown): ValidationSeverity {
  if (typeof value !== "string") return "LIMITATION";
  const upper = value.toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LIMITATION") {
    return upper;
  }
  return "LIMITATION";
}

function normalizeFindings(findings: ValidationEngineResponse["findings"]): ValidationFinding[] {
  if (!Array.isArray(findings)) return [];
  return findings.map((item, index) => {
    const severity = normalizeSeverity(item?.severity);
    const id = typeof item?.id === "string" && item.id.trim() ? item.id : `finding-${index + 1}`;
    const title =
      typeof item?.title === "string" && item.title.trim()
        ? item.title
        : "Unnamed validation finding";
    return {
      id,
      title,
      severity,
      details: typeof item?.details === "string" ? item.details : undefined,
      component: typeof item?.component === "string" ? item.component : undefined,
    };
  });
}

function calculateEnforcementScore(findings: ValidationFinding[]): number {
  const deductions = findings.reduce((sum, finding) => sum + SCORE_DEDUCTIONS[finding.severity], 0);
  return Math.max(0, 100 - deductions);
}

function determineStatus(score: number, findings: ValidationFinding[]): ValidationStatus {
  const hasCritical = findings.some((f) => f.severity === "CRITICAL");
  const hasHighOrMedium = findings.some((f) => f.severity === "HIGH" || f.severity === "MEDIUM");
  if (hasCritical || score < 70) return "FAIL";
  if (hasHighOrMedium || score < 90) return "WARN";
  return "PASS";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildExecutiveHtml(report: Omit<ValidationReport, "executiveHtml">): string {
  const findingsRows = report.findings
    .map((f) => {
      const color = f.severity === 'CRITICAL' ? '#ef4444' : f.severity === 'HIGH' ? '#f59e0b' : '#374151';
      return `<tr style="color:#000000;">
<td style="padding:8px;border:1px solid #ddd;">${escapeHtml(f.id)}</td>
<td style="padding:8px;border:1px solid #ddd;color:${color};font-weight:bold;">${escapeHtml(f.severity)}</td>
<td style="padding:8px;border:1px solid #ddd;">${escapeHtml(f.title)}</td>
<td style="padding:8px;border:1px solid #ddd;">${escapeHtml(f.component ?? "-")}</td>
</tr>`;
    })
    .join("");

  const table =
    findingsRows.length > 0
      ? `<table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;color:#000000;margin-top:20px;">
<thead style="background-color:#f3f4f6;color:#000000;"><tr>
<th style="padding:10px;border:1px solid #ddd;text-align:left;">ID</th>
<th style="padding:10px;border:1px solid #ddd;text-align:left;">Severity</th>
<th style="padding:10px;border:1px solid #ddd;text-align:left;">Title</th>
<th style="padding:10px;border:1px solid #ddd;text-align:left;">Component</th>
</tr></thead>
<tbody>${findingsRows}</tbody>
</table>`
      : `<p style="font-family:Arial,sans-serif;color:#000000;">No findings reported by the validation engine.</p>`;

  return `<!doctype html>
<html>
<body style="font-family:Arial,sans-serif;color:#000000;background-color:#ffffff;padding:40px;line-height:1.6;">
  <div style="max-width:800px;margin:0 auto;border:1px solid #eee;padding:30px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
    <h1 style="color:#000000;margin-top:0;border-bottom:2px solid #3b82f6;padding-bottom:10px;">Complyze Governance Audit Report</h1>
    <div style="background:#f9fafb;padding:20px;border-radius:6px;margin-bottom:20px;color:#000000;">
      <p style="margin:5px 0;"><strong>Environment:</strong> ${escapeHtml(report.environment)}</p>
      <p style="margin:5px 0;"><strong>Status:</strong> <span style="color:${report.status === 'FAIL' ? '#ef4444' : '#22c55e'};font-weight:bold;">${escapeHtml(report.status)}</span></p>
      <p style="margin:5px 0;"><strong>Enforcement Score:</strong> ${report.score}/100</p>
      <p style="margin:5px 0;"><strong>Generated At:</strong> ${escapeHtml(report.generatedAt)}</p>
      <p style="margin:5px 0;"><strong>Summary Counts:</strong> 
        <span style="color:#ef4444">Critical: ${report.criticalCount}</span>, 
        <span style="color:#f59e0b">High: ${report.highCount}</span>, 
        <span style="color:#374151">Medium: ${report.mediumCount}</span>
      </p>
    </div>
    ${table}
    <div style="margin-top:30px;font-size:12px;color:#666;text-align:center;border-top:1px solid #eee;padding-top:10px;">
      &copy; ${new Date().getFullYear()} Complyze AI Governance. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}

async function executeValidationEngine(input: {
  mode: ExecutionMode;
  environment: ValidationEnvironment;
}): Promise<ValidationEngineResponse> {
  const endpoint = process.env.PROXY_VALIDATION_ENGINE_URL;
  if (!endpoint) {
    throw new Error("Missing PROXY_VALIDATION_ENGINE_URL");
  }

  const token = process.env.PROXY_VALIDATION_ENGINE_TOKEN;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mode: input.mode,
      environment: input.environment,
      requestedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Validation engine failed: ${response.status} ${response.statusText} ${text}`);
  }

  const json = (await response.json()) as ValidationEngineResponse;
  return json;
}

async function sendReportEmail(args: {
  report: ValidationReport;
  mode: ExecutionMode;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PROXY_VALIDATION_EMAIL_FROM;
  const to = process.env.PROXY_VALIDATION_EMAIL_TO;

  if (!apiKey || !from || !to) {
    console.warn(
      "[proxy_validation_assurance_skill] Email skipped: missing RESEND_API_KEY or PROXY_VALIDATION_EMAIL_FROM/TO",
    );
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Proxy Validation ${args.report.status} (${args.report.environment})`,
        html: args.report.executiveHtml,
        text: `Status=${args.report.status}, Score=${args.report.score}, Environment=${args.report.environment}, Mode=${args.mode}`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend error: ${response.status} ${response.statusText} ${text}`);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[proxy_validation_assurance_skill] Email failure: ${message}`);
    return false;
  }
}

function logExecutionMetadata(result: SkillResult, input: ProxyValidationSkillInput): void {
  const payload = {
    event: "proxy_validation_assurance_skill_execution",
    mode: input.mode,
    notifyRequested: input.notify,
    environment: result.report.environment,
    status: result.report.status,
    score: result.report.score,
    emailed: result.emailed,
    executionTimeMs: result.executionTimeMs,
    generatedAt: result.report.generatedAt,
  };
  console.info(JSON.stringify(payload));
}

export async function executeProxyValidationSkill(
  input: ProxyValidationSkillInput,
): Promise<SkillResult> {
  const startedAt = Date.now();
  const environment = resolveEnvironment(input.environment);

  const engineResponse = await executeValidationEngine({
    mode: input.mode,
    environment,
  });

  const findings = normalizeFindings(engineResponse.findings);
  const score = calculateEnforcementScore(findings);
  const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
  const highCount = findings.filter((f) => f.severity === "HIGH").length;
  const mediumCount = findings.filter((f) => f.severity === "MEDIUM").length;
  const limitationCount = findings.filter((f) => f.severity === "LIMITATION").length;
  const status = determineStatus(score, findings);
  const generatedAt = engineResponse.generatedAt ?? new Date().toISOString();

  const partialReport: Omit<ValidationReport, "executiveHtml"> = {
    environment,
    generatedAt,
    score,
    status,
    totalFindings: findings.length,
    criticalCount,
    highCount,
    mediumCount,
    limitationCount,
    findings,
  };

  const report: ValidationReport = {
    ...partialReport,
    executiveHtml: buildExecutiveHtml(partialReport),
  };

  const emailed = input.notify ? await sendReportEmail({ report, mode: input.mode }) : false;
  const executionTimeMs = Date.now() - startedAt;

  const result: SkillResult = {
    report,
    emailed,
    executionTimeMs,
  };

  logExecutionMetadata(result, input);
  return result;
}
