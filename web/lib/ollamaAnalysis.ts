/**
 * Complyze Ollama Analysis Service
 *
 * Routes ALL prompt-risk analysis through a locally-hosted Ollama model.
 * No external LLM providers. No regex-based blocking. All decisions originate
 * from the local LLM inference result.
 *
 * Connectivity notes:
 *  - The Ollama server MUST run locally at http://localhost:11434 (default).
 *  - Install Ollama: https://ollama.com/  then `ollama pull complyze-qwen`
 *  - Override OLLAMA_BASE_URL only to point at a different local or private host.
 *    NEVER point it at a public/external endpoint — all analysis must be local.
 *
 * Configuration (all env-driven, no hardcoding):
 *  OLLAMA_BASE_URL   — local Ollama base URL (default: http://localhost:11434)
 *  OLLAMA_MODEL      — model name, e.g. complyze-qwen or llama3
 *  OLLAMA_TIMEOUT_MS — request timeout in ms (default 30000)
 *
 * Architecture:
 *  Browser Extension → http://localhost:11434/api/generate → LLM risk evaluation
 *  Backend  (fallback) → OLLAMA_BASE_URL/api/generate     → LLM risk evaluation
 *  Policy engine uses LLM output — regex is never the decision source.
 *
 *  1. Build prompt payload (user prompt + attachment context + metadata)
 *  2. POST ${OLLAMA_BASE_URL}/api/generate with the full Complyze JSON schema
 *  3. Parse the outer Ollama envelope, then parse `response` as JSON
 *  4. Normalise / validate the parsed object against the schema
 *  5. Return the validated ComplyzeAnalysisResult or throw a typed error
 */

// ─────────────────────────────────────────────────────────────────────────────
// Local Ollama configuration — resolved from environment variables with
// sensible localhost defaults so the service works out-of-the-box.
// ─────────────────────────────────────────────────────────────────────────────

function getOllamaConfig() {
    // Default to localhost — all analysis must be performed locally.
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").trim();
    const model = (process.env.OLLAMA_MODEL || "complyze-qwen").trim();
    // Tighter default timeout for local inference (30 s instead of 60 s).
    const timeout = parseInt(process.env.OLLAMA_TIMEOUT_MS || "30000", 10);

    if (!baseUrl) {
        throw new Error(
            "[ollamaAnalysis] OLLAMA_BASE_URL resolved to an empty string. " +
            "Ensure Ollama is running locally: https://ollama.com/ " +
            "Default: OLLAMA_BASE_URL=http://localhost:11434"
        );
    }
    if (!model) {
        throw new Error(
            "[ollamaAnalysis] OLLAMA_MODEL is not set. " +
            "Example: OLLAMA_MODEL=complyze-qwen"
        );
    }

    return {
        baseUrl: baseUrl.replace(/\/$/, ""), // strip trailing slash
        model,
        timeoutMs: isNaN(timeout) ? 30_000 : timeout,
    };
}

const DEV = process.env.NODE_ENV === "development";

// ─────────────────────────────────────────────────────────────────────────────
// Complyze Schema (used as `format` in every Ollama request)
// ─────────────────────────────────────────────────────────────────────────────

export const COMPLYZE_SCHEMA = {
    type: "object",
    properties: {
        analysis_version: { type: "string" },
        prompt_summary: { type: "string" },
        redacted_prompt: { type: "string" },
        overall_risk_score: { type: "integer", minimum: 0, maximum: 100 },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        sensitive_categories: {
            type: "array",
            items: {
                type: "string",
                enum: [
                    "credentials", "access_keys", "tokens", "passwords", "secrets",
                    "pii_basic", "pii_sensitive", "financial_data", "health_data",
                    "legal_privileged", "source_code", "internal_architecture",
                    "security_findings", "customer_data", "employee_data",
                    "regulated_data", "proprietary_strategy", "incident_data",
                ],
            },
        },
        contextual_risks: {
            type: "array",
            items: {
                type: "string",
                enum: [
                    "credential_exposure", "data_exfiltration", "policy_bypass_attempt",
                    "social_engineering", "internal_system_disclosure",
                    "sensitive_summarization", "third_party_sharing_risk",
                    "attachment_sensitive_content", "regulated_workflow_risk",
                    "unsafe_code_assistance",
                ],
            },
        },
        findings: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    category: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    evidence: { type: "string" },
                    reason: { type: "string" },
                    recommended_fix: { type: "string" },
                },
                required: ["category", "severity", "confidence", "evidence", "reason", "recommended_fix"],
            },
        },
        attachment_analysis: {
            type: "object",
            properties: {
                attachment_present: { type: "boolean" },
                attachment_type: { type: "string" },
                attachment_risk_score: { type: "integer", minimum: 0, maximum: 100 },
                attachment_findings: { type: "array", items: { type: "string" } },
            },
            required: ["attachment_present", "attachment_type", "attachment_risk_score", "attachment_findings"],
        },
        suggested_action: {
            type: "string",
            enum: ["allow", "allow_with_redaction", "warn", "block", "manual_review"],
        },
        dashboard_metrics: {
            type: "object",
            properties: {
                pii_count: { type: "integer" },
                secret_count: { type: "integer" },
                credential_count: { type: "integer" },
                attachment_issue_count: { type: "integer" },
                contextual_risk_count: { type: "integer" },
            },
            required: [
                "pii_count", "secret_count", "credential_count",
                "attachment_issue_count", "contextual_risk_count",
            ],
        },
        graph_data: {
            type: "object",
            properties: {
                risk_score: { type: "integer", minimum: 0, maximum: 100 },
                severity_band: { type: "string", enum: ["low", "medium", "high", "critical"] },
                breakdown: {
                    type: "object",
                    properties: {
                        sensitive_content: { type: "integer" },
                        contextual_risk: { type: "integer" },
                        attachment_risk: { type: "integer" },
                        policy_violation: { type: "integer" },
                    },
                    required: ["sensitive_content", "contextual_risk", "attachment_risk", "policy_violation"],
                },
            },
            required: ["risk_score", "severity_band", "breakdown"],
        },
    },
    required: [
        "analysis_version", "prompt_summary", "redacted_prompt",
        "overall_risk_score", "severity", "confidence",
        "sensitive_categories", "contextual_risks", "findings",
        "attachment_analysis", "suggested_action",
        "dashboard_metrics", "graph_data",
    ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplyzeAnalysisInput {
    /** The raw user prompt text */
    promptText: string;
    /** Whether an attachment was present */
    attachmentPresent?: boolean;
    /** MIME type or descriptive type of the attachment */
    attachmentType?: string;
    /** Extracted text content from the attachment (if any) */
    attachmentText?: string;
    /** Optional policy rules in effect */
    policyRules?: unknown[];
    /** Optional metadata (AI tool name, org, user) */
    metadata?: Record<string, string>;
}

export interface ComplyzeAnalysisResult {
    analysis_version: string;
    prompt_summary: string;
    redacted_prompt: string;
    overall_risk_score: number;
    severity: "low" | "medium" | "high" | "critical";
    confidence: number;
    sensitive_categories: string[];
    contextual_risks: string[];
    findings: Array<{
        category: string;
        severity: "low" | "medium" | "high" | "critical";
        confidence: number;
        evidence: string;
        reason: string;
        recommended_fix: string;
    }>;
    attachment_analysis: {
        attachment_present: boolean;
        attachment_type: string;
        attachment_risk_score: number;
        attachment_findings: string[];
    };
    suggested_action: "allow" | "allow_with_redaction" | "warn" | "block" | "manual_review";
    dashboard_metrics: {
        pii_count: number;
        secret_count: number;
        credential_count: number;
        attachment_issue_count: number;
        contextual_risk_count: number;
    };
    graph_data: {
        risk_score: number;
        severity_band: "low" | "medium" | "high" | "critical";
        breakdown: {
            sensitive_content: number;
            contextual_risk: number;
            attachment_risk: number;
            policy_violation: number;
        };
    };
}

export interface OllamaAnalysisError {
    code:
    | "TIMEOUT"
    | "UNREACHABLE"
    | "INVALID_JSON"
    | "SCHEMA_VALIDATION"
    | "OLLAMA_ERROR"
    | "UNKNOWN";
    message: string;
    raw?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowed enum sets for normalisation
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);
const ACTION_VALUES = new Set([
    "allow", "allow_with_redaction", "warn", "block", "manual_review",
]);
const SENSITIVE_CATEGORY_VALUES = new Set([
    "credentials", "access_keys", "tokens", "passwords", "secrets",
    "pii_basic", "pii_sensitive", "financial_data", "health_data",
    "legal_privileged", "source_code", "internal_architecture",
    "security_findings", "customer_data", "employee_data",
    "regulated_data", "proprietary_strategy", "incident_data",
]);
const CONTEXTUAL_RISK_VALUES = new Set([
    "credential_exposure", "data_exfiltration", "policy_bypass_attempt",
    "social_engineering", "internal_system_disclosure",
    "sensitive_summarization", "third_party_sharing_risk",
    "attachment_sensitive_content", "regulated_workflow_risk",
    "unsafe_code_assistance",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(input: ComplyzeAnalysisInput): string {
    const lines: string[] = [
        "You are the Complyze AI Security Analyst.",
        "Analyse the following prompt submission for data-security, privacy, and policy risks.",
        "You are strictly an analysis engine. You do NOT make the final enforcement decision.",
        "Provide a 'suggested_action' based on risk, but understand this is advisory only. The actual block/allow decision will be made by the backend policy engine.",
        "Return ONLY the structured JSON — no additional commentary.",
        "",
        `## User Prompt`,
        input.promptText,
        "",
    ];

    if (input.attachmentPresent) {
        lines.push(`## Attachment`);
        lines.push(`Present: true`);
        lines.push(`Type: ${input.attachmentType || "unknown"}`);
        if (input.attachmentText) {
            lines.push(`Extracted Content:`);
            lines.push(input.attachmentText.slice(0, 4000)); // cap at 4 KB
        }
        lines.push("");
    } else {
        lines.push(`## Attachment`);
        lines.push(`Present: false`);
        lines.push("");
    }

    if (input.policyRules && input.policyRules.length > 0) {
        lines.push(`## Active Policy Rules`);
        lines.push(JSON.stringify(input.policyRules, null, 2));
        lines.push("");
    }

    if (input.metadata && Object.keys(input.metadata).length > 0) {
        lines.push(`## Submission Metadata`);
        for (const [k, v] of Object.entries(input.metadata)) {
            lines.push(`${k}: ${v}`);
        }
        lines.push("");
    }

    lines.push("Respond with a single JSON object matching the required schema exactly.");
    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseSeverity(v: unknown): "low" | "medium" | "high" | "critical" {
    if (typeof v !== "string") return "low";
    const lower = v.toLowerCase().trim();
    if (SEVERITY_VALUES.has(lower)) return lower as "low" | "medium" | "high" | "critical";
    if (DEV) console.warn(`[ollamaAnalysis] Dropped invalid severity: "${v}"`);
    return "low";
}

function recomputeSeverity(score: number): "low" | "medium" | "high" | "critical" {
    if (score <= 20) return "low";
    if (score <= 45) return "medium";
    if (score <= 75) return "high";
    return "critical";
}

function normaliseAction(v: unknown): "allow" | "allow_with_redaction" | "warn" | "block" | "manual_review" {
    if (typeof v !== "string") return "manual_review";
    const lower = v.toLowerCase().trim().replace(/\s+/g, "_");
    if (ACTION_VALUES.has(lower)) return lower as "allow" | "allow_with_redaction" | "warn" | "block" | "manual_review";
    if (DEV) console.warn(`[ollamaAnalysis] Dropped invalid action: "${v}"`);
    return "manual_review";
}

function normaliseConfidence(v: unknown): number {
    const n = Number(v);
    if (isNaN(n)) return 0;
    if (n > 1 && n <= 100) return Math.min(n / 100, 1); // convert 0-100 → 0-1
    return Math.max(0, Math.min(1, n));
}

function normaliseInt(v: unknown, fallback = 0): number {
    const n = Number(v);
    return isNaN(n) ? fallback : Math.round(n);
}

function filterEnum<T extends string>(arr: unknown, allowed: Set<T>, fieldName: string = "enum"): T[] {
    if (!Array.isArray(arr)) return [];
    const valid: T[] = [];
    for (const x of arr) {
        if (typeof x === "string") {
            const lower = x.toLowerCase().trim() as T;
            if (allowed.has(lower)) {
                valid.push(lower);
            } else if (DEV) {
                console.warn(`[ollamaAnalysis] Dropped invalid enum value in ${fieldName}: "${x}"`);
            }
        }
    }
    return valid;
}

function generateRedactedPrompt(prompt: string): string {
    if (!prompt || !prompt.trim()) return prompt || "";
    let redacted = prompt;
    // Basic redaction of obvious patterns
    // AWS keys
    redacted = redacted.replace(/(AKIA|ASIA)[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]");
    // SSN
    redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
    // Bearer tags
    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9\-\._~+\/]+=*/gi, "Bearer [REDACTED_TOKEN]");
    // API keys
    redacted = redacted.replace(/api[_-]?key[^\w]{1,5}[A-Za-z0-9_-]{16,}/gi, "api_key=[REDACTED]");
    // Passwords in assignments
    redacted = redacted.replace(/password[^\w]{1,5}[A-Za-z0-9_!@#$%^&\*\-]{6,}/gi, "password=[REDACTED]");
    return redacted;
}

function normaliseFindings(raw: unknown): ComplyzeAnalysisResult["findings"] {
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => ({
        category: typeof f?.category === "string" ? f.category : "unknown",
        severity: normaliseSeverity(f?.severity),
        confidence: normaliseConfidence(f?.confidence),
        evidence: typeof f?.evidence === "string" ? f.evidence : "",
        reason: typeof f?.reason === "string" ? f.reason : "",
        recommended_fix: typeof f?.recommended_fix === "string" ? f.recommended_fix : "",
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema validation (structural check on required top-level keys)
// ─────────────────────────────────────────────────────────────────────────────

function validateRequired(obj: Record<string, unknown>): void {
    const required = COMPLYZE_SCHEMA.required as readonly string[];
    const missing = required.filter((k) => !(k in obj));
    if (missing.length > 0) {
        throw new Error(`Schema validation failed — missing keys: ${missing.join(", ")}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise + validate the raw parsed object
// ─────────────────────────────────────────────────────────────────────────────

export function normaliseAndValidate(raw: unknown, originalPromptText: string): ComplyzeAnalysisResult {
    if (typeof raw !== "object" || raw === null) {
        throw new Error("Parsed response is not an object");
    }

    const obj = raw as Record<string, unknown>;

    // Structural check
    validateRequired(obj);

    // Attachment analysis block
    const aa = (typeof obj.attachment_analysis === "object" && obj.attachment_analysis !== null)
        ? (obj.attachment_analysis as Record<string, unknown>)
        : {};

    // Dashboard metrics block
    const dm = (typeof obj.dashboard_metrics === "object" && obj.dashboard_metrics !== null)
        ? (obj.dashboard_metrics as Record<string, unknown>)
        : {};

    // Graph data block
    const gd = (typeof obj.graph_data === "object" && obj.graph_data !== null)
        ? (obj.graph_data as Record<string, unknown>)
        : {};
    const breakdown = (typeof gd.breakdown === "object" && gd.breakdown !== null)
        ? (gd.breakdown as Record<string, unknown>)
        : {};

    // Recompute severity from score
    let riskScore = normaliseInt(obj.overall_risk_score, -1);
    if (riskScore === -1) {
        if (DEV) console.warn("[ollamaAnalysis] overall_risk_score missing, falling back to 0");
        riskScore = 0;
    }
    const computedSeverity = recomputeSeverity(riskScore);

    // Redacted prompt fallback
    let redacted = typeof obj.redacted_prompt === "string" ? obj.redacted_prompt.trim() : "";
    if (!redacted) {
        redacted = generateRedactedPrompt(originalPromptText);
        if (DEV) console.log("[ollamaAnalysis] Computed fallback redacted_prompt due to missing/empty value.");
    }

    const result: ComplyzeAnalysisResult = {
        analysis_version: typeof obj.analysis_version === "string" ? obj.analysis_version : "1.0",
        prompt_summary: typeof obj.prompt_summary === "string" ? obj.prompt_summary : "",
        redacted_prompt: redacted,
        overall_risk_score: riskScore,
        severity: computedSeverity,
        confidence: normaliseConfidence(obj.confidence),
        sensitive_categories: filterEnum(obj.sensitive_categories, SENSITIVE_CATEGORY_VALUES as Set<string>, "sensitive_categories") as string[],
        contextual_risks: filterEnum(obj.contextual_risks, CONTEXTUAL_RISK_VALUES as Set<string>, "contextual_risks") as string[],
        findings: normaliseFindings(obj.findings),
        attachment_analysis: {
            attachment_present: Boolean(aa.attachment_present),
            attachment_type: typeof aa.attachment_type === "string" ? aa.attachment_type : "none",
            attachment_risk_score: normaliseInt(aa.attachment_risk_score),
            attachment_findings: Array.isArray(aa.attachment_findings)
                ? aa.attachment_findings.filter((x) => typeof x === "string")
                : [],
        },
        suggested_action: normaliseAction(obj.suggested_action ?? obj.recommended_action),
        dashboard_metrics: {
            pii_count: normaliseInt(dm.pii_count),
            secret_count: normaliseInt(dm.secret_count),
            credential_count: normaliseInt(dm.credential_count),
            attachment_issue_count: normaliseInt(dm.attachment_issue_count),
            contextual_risk_count: normaliseInt(dm.contextual_risk_count),
        },
        graph_data: {
            risk_score: normaliseInt(gd.risk_score ?? riskScore),
            severity_band: computedSeverity,
            breakdown: {
                sensitive_content: normaliseInt(breakdown.sensitive_content),
                contextual_risk: normaliseInt(breakdown.contextual_risk),
                attachment_risk: normaliseInt(breakdown.attachment_risk),
                policy_violation: normaliseInt(breakdown.policy_violation),
            },
        },
    };

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: analysePrompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyses a prompt via the locally-hosted Ollama model.
 * Configuration is read from OLLAMA_BASE_URL / OLLAMA_MODEL / OLLAMA_TIMEOUT_MS.
 * Defaults to http://localhost:11434 — all analysis must occur locally.
 * Throws an OllamaAnalysisError (with `.code`) on any failure.
 */
export async function analysePrompt(
    input: ComplyzeAnalysisInput,
): Promise<ComplyzeAnalysisResult> {
    const prompt = buildAnalysisPrompt(input);

    if (DEV) {
        console.log("[ollamaAnalysis] Outbound payload summary:", {
            promptLength: input.promptText.length,
            attachmentPresent: input.attachmentPresent ?? false,
            attachmentType: input.attachmentType ?? "none",
            attachmentTextLength: input.attachmentText?.length ?? 0,
            policyRulesCount: input.policyRules?.length ?? 0,
            metadata: input.metadata ?? {},
        });
    }

    // Resolve remote config on every call so env changes are picked up
    // without restarting the server (useful when rotating hosts).
    const { baseUrl, model, timeoutMs } = getOllamaConfig();

    if (DEV) {
        console.log(`[ollamaAnalysis] Remote target: ${baseUrl} | model: ${model}`);
    }

    const body = JSON.stringify({
        model,
        prompt,
        stream: false,
        format: COMPLYZE_SCHEMA,
    });

    let rawResponse: string | undefined;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let res: Response;
        try {
            res = await fetch(`${baseUrl}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!res.ok) {
            const text = await res.text().catch(() => "(unreadable)");
            const err: OllamaAnalysisError = {
                code: "OLLAMA_ERROR",
                message: `Ollama responded with HTTP ${res.status}: ${text}`,
                raw: text,
            };
            if (DEV) console.error("[ollamaAnalysis] Ollama HTTP error:", err);
            throw Object.assign(new Error(err.message), err);
        }

        rawResponse = await res.text();

        if (DEV) {
            console.log("[ollamaAnalysis] Raw Ollama response:", rawResponse.slice(0, 2000));
        }

        // ── Parse Ollama envelope ──────────────────────────────────────────────
        let ollamaEnvelope: Record<string, unknown>;
        try {
            ollamaEnvelope = JSON.parse(rawResponse);
        } catch {
            const err: OllamaAnalysisError = {
                code: "INVALID_JSON",
                message: "Ollama outer envelope is not valid JSON",
                raw: rawResponse,
            };
            if (DEV) console.error("[ollamaAnalysis] Outer JSON parse failure:", err);
            throw Object.assign(new Error(err.message), err);
        }

        const innerRaw = ollamaEnvelope.response;
        if (typeof innerRaw !== "string") {
            const err: OllamaAnalysisError = {
                code: "INVALID_JSON",
                message: "Ollama envelope `response` field is not a string",
                raw: rawResponse,
            };
            throw Object.assign(new Error(err.message), err);
        }

        // ── Parse inner JSON ───────────────────────────────────────────────────
        let parsed: unknown;
        try {
            parsed = JSON.parse(innerRaw);
        } catch {
            const err: OllamaAnalysisError = {
                code: "INVALID_JSON",
                message: "Ollama `response` field contains invalid JSON",
                raw: innerRaw,
            };
            if (DEV) console.error("[ollamaAnalysis] Inner JSON parse failure:", err);
            throw Object.assign(new Error(err.message), err);
        }

        // ── Normalise & validate ───────────────────────────────────────────────
        let validated: ComplyzeAnalysisResult;
        try {
            validated = normaliseAndValidate(parsed, input.promptText);
        } catch (validationError) {
            const msg =
                validationError instanceof Error ? validationError.message : "Unknown validation error";
            const err: OllamaAnalysisError = {
                code: "SCHEMA_VALIDATION",
                message: msg,
                raw: innerRaw,
            };
            if (DEV) console.error("[ollamaAnalysis] Validation failure:", err);
            throw Object.assign(new Error(err.message), err);
        }

        if (DEV) {
            console.log("[ollamaAnalysis] Validated and normalized output:", {
                overall_risk_score: validated.overall_risk_score,
                severity: validated.severity,
                suggested_action: validated.suggested_action,
                confidence: validated.confidence,
                findingsCount: validated.findings.length,
            });
        }

        return validated;
    } catch (error) {
        // Re-throw typed errors unchanged
        if (error && typeof (error as OllamaAnalysisError).code === "string") {
            throw error;
        }

        // Handle AbortController signal (timeout)
        if (error instanceof Error && error.name === "AbortError") {
            const { baseUrl: b, timeoutMs: t } = getOllamaConfig();
            const err: OllamaAnalysisError = {
                code: "TIMEOUT",
                message: `Ollama request to ${b} timed out after ${t}ms`,
            };
            throw Object.assign(new Error(err.message), err);
        }

        // Handle fetch / network errors (connection refused means Ollama isn't running)
        if (error instanceof TypeError) {
            const { baseUrl: b } = getOllamaConfig();
            const err: OllamaAnalysisError = {
                code: "UNREACHABLE",
                message: `Cannot reach local Ollama at ${b}: ${error.message}. ` +
                    "Ensure Ollama is installed and running: https://ollama.com/ " +
                    "Then pull the model: ollama pull complyze-qwen",
            };
            throw Object.assign(new Error(err.message), err);
        }

        const err: OllamaAnalysisError = {
            code: "UNKNOWN",
            message: error instanceof Error ? error.message : String(error),
            raw: rawResponse,
        };
        throw Object.assign(new Error(err.message), err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback result (used when analysis fails and the caller wants a graceful UI)
// ─────────────────────────────────────────────────────────────────────────────

export function buildFallbackResult(errorMessage: string): ComplyzeAnalysisResult & {
    _error: string;
} {
    return {
        analysis_version: "1.0",
        prompt_summary: "Analysis unavailable",
        redacted_prompt: "",
        overall_risk_score: 0,
        severity: "low",
        confidence: 0,
        sensitive_categories: [],
        contextual_risks: [],
        findings: [],
        attachment_analysis: {
            attachment_present: false,
            attachment_type: "none",
            attachment_risk_score: 0,
            attachment_findings: [],
        },
        suggested_action: "warn",
        dashboard_metrics: {
            pii_count: 0,
            secret_count: 0,
            credential_count: 0,
            attachment_issue_count: 0,
            contextual_risk_count: 0,
        },
        graph_data: {
            risk_score: 0,
            severity_band: "low",
            breakdown: {
                sensitive_content: 0,
                contextual_risk: 0,
                attachment_risk: 0,
                policy_violation: 0,
            },
        },
        _error: errorMessage,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Ollama text completion (for non-analysis routes: extract, assess, report)
// Sends requests to the local Ollama instance via OLLAMA_BASE_URL (localhost:11434).
// ─────────────────────────────────────────────────────────────────────────────

export interface OllamaTextOptions {
    /** Optional JSON schema to enforce structured output */
    format?: Record<string, unknown>;
    /** Defaults to false */
    stream?: false;
}

/**
 * Generic text generation via Ollama.
 * Returns the raw `response` string from the Ollama envelope.
 * Callers are responsible for parsing the result.
 */
export async function callOllama(
    prompt: string,
    options: OllamaTextOptions = {},
): Promise<string> {
    if (DEV) {
        console.log("[callOllama] Sending prompt (first 500 chars):", prompt.slice(0, 500));
    }

    const { baseUrl, model, timeoutMs } = getOllamaConfig();

    const body: Record<string, unknown> = {
        model,
        prompt,
        stream: false,
    };

    if (options.format) {
        body.format = options.format;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
        res = await fetch(`${baseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const raw = await res.text();

    if (DEV) {
        console.log("[callOllama] Raw response (first 1000 chars):", raw.slice(0, 1000));
    }

    let envelope: Record<string, unknown>;
    try {
        envelope = JSON.parse(raw);
    } catch {
        throw new Error("Ollama response is not valid JSON");
    }

    if (typeof envelope.response !== "string") {
        throw new Error("Ollama envelope missing `response` string");
    }

    return envelope.response as string;
}
