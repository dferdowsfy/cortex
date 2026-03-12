/**
 * Complyze Prompt 2 — Classification Service
 *
 * Orchestrates the LLM call, JSON parsing, validation, and retry logic
 * for producing a Risk Classification from a tool profile + enrichment.
 * All LLM calls route through the Ollama model on the VPS.
 */
import type { ToolIntelligenceProfile } from "./schema.js";
import type {
  ClassificationRequest,
  RiskClassification,
} from "./classificationSchema.js";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
} from "./classificationPrompts.js";
import {
  validateClassification,
  type ClassificationValidationResult,
  type ClassificationValidationFailure,
} from "./classificationValidation.js";
import {
  type LLMCaller,
  createOllamaExtractCaller,
  parseJsonResponse,
  type ExtractionConfig,
} from "./extraction.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ClassificationConfig {
  /** Override OLLAMA_BASE_URL */
  baseUrl?: string;
  /** Override OLLAMA_MODEL */
  model?: string;
  /** Timeout in ms. Default: 60000 */
  timeoutMs?: number;
  /** Number of retry attempts on validation failure. Default: 1 */
  maxRetries?: number;
}

const CLASSIFICATION_DEFAULTS = {
  maxRetries: 1,
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ClassificationSuccess {
  ok: true;
  classification: RiskClassification;
  attempts: number;
}

export interface ClassificationError {
  ok: false;
  errors: string[];
  rawOutput?: string;
  attempts: number;
}

export type ClassificationResult = ClassificationSuccess | ClassificationError;

// ---------------------------------------------------------------------------
// Core classification logic
// ---------------------------------------------------------------------------

/**
 * Run the full classification pipeline:
 * build prompt → call LLM → parse → validate → retry if needed.
 */
export async function classifyToolRisk(
  profile: ToolIntelligenceProfile,
  request: ClassificationRequest,
  caller: LLMCaller,
  options?: {
    maxRetries?: number;
    previousClassification?: RiskClassification;
  },
): Promise<ClassificationResult> {
  const maxRetries = options?.maxRetries ?? CLASSIFICATION_DEFAULTS.maxRetries;
  const userPrompt = buildClassificationUserPrompt(
    profile,
    request,
    options?.previousClassification,
  );

  let lastErrors: string[] = [];
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= 1 + maxRetries; attempt++) {
    try {
      const raw = await caller(CLASSIFICATION_SYSTEM_PROMPT, userPrompt);
      lastRaw = raw;

      const parsed = parseJsonResponse(raw);
      const result: ClassificationValidationResult =
        validateClassification(parsed);

      if (result.valid) {
        return {
          ok: true,
          classification: result.classification,
          attempts: attempt,
        };
      }

      lastErrors = (result as ClassificationValidationFailure).errors;
    } catch (err) {
      lastErrors = [
        err instanceof SyntaxError
          ? `JSON parse error: ${err.message}`
          : `LLM call failed: ${String(err)}`,
      ];
    }
  }

  return {
    ok: false,
    errors: lastErrors,
    rawOutput: lastRaw,
    attempts: 1 + maxRetries,
  };
}

// ---------------------------------------------------------------------------
// High-level convenience function
// ---------------------------------------------------------------------------

/**
 * One-call convenience: creates the Ollama caller and runs classification.
 */
export async function analyzeToolRisk(
  profile: ToolIntelligenceProfile,
  request: ClassificationRequest,
  config?: ClassificationConfig,
  previousClassification?: RiskClassification,
): Promise<ClassificationResult> {
  const callerConfig: ExtractionConfig = {
    baseUrl: config?.baseUrl,
    model: config?.model,
    timeoutMs: config?.timeoutMs,
  };
  const caller = createOllamaExtractCaller(callerConfig);
  return classifyToolRisk(profile, request, caller, {
    maxRetries: config?.maxRetries,
    previousClassification,
  });
}
