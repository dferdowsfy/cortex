/**
 * Complyze Prompt 2 — Classification Service
 *
 * Orchestrates the LLM call, JSON parsing, validation, and retry logic
 * for producing a Risk Classification from a tool profile + enrichment.
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
  createAnthropicCaller,
  parseJsonResponse,
  type ExtractionConfig,
} from "./extraction.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ClassificationConfig {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Default: claude-sonnet-4-5-20250929 */
  model?: string;
  /** Temperature. Default: 0.0 (deterministic scoring). */
  temperature?: number;
  /** Max tokens. Default: 3000 */
  maxTokens?: number;
  /** Number of retry attempts on validation failure. Default: 1 */
  maxRetries?: number;
}

const CLASSIFICATION_DEFAULTS: Required<Omit<ClassificationConfig, "apiKey">> = {
  model: "claude-sonnet-4-5-20250929",
  temperature: 0.0,
  maxTokens: 3000,
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
 * One-call convenience: creates the Anthropic caller and runs classification.
 */
export async function analyzeToolRisk(
  profile: ToolIntelligenceProfile,
  request: ClassificationRequest,
  config?: ClassificationConfig,
  previousClassification?: RiskClassification,
): Promise<ClassificationResult> {
  const callerConfig: ExtractionConfig = {
    apiKey: config?.apiKey,
    model: config?.model ?? CLASSIFICATION_DEFAULTS.model,
    temperature: config?.temperature ?? CLASSIFICATION_DEFAULTS.temperature,
    maxTokens: config?.maxTokens ?? CLASSIFICATION_DEFAULTS.maxTokens,
  };
  const caller = createAnthropicCaller(callerConfig);
  return classifyToolRisk(profile, request, caller, {
    maxRetries: config?.maxRetries,
    previousClassification,
  });
}
