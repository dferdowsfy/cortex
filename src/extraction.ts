/**
 * Complyze Prompt 1 — Extraction Service
 *
 * Orchestrates the LLM call, JSON parsing, validation, and retry logic
 * for producing a Tool Intelligence Profile.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionRequest, ToolIntelligenceProfile } from "./schema.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import {
  validateProfile,
  type ValidationResult,
  type ValidationFailure,
} from "./validation.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ExtractionConfig {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Default: claude-sonnet-4-5-20250929 */
  model?: string;
  /** Temperature. Default: 0.1 (low for consistency). */
  temperature?: number;
  /** Max tokens. Default: 4096 */
  maxTokens?: number;
  /** Number of retry attempts on validation failure. Default: 1 */
  maxRetries?: number;
}

const DEFAULT_CONFIG: Required<Omit<ExtractionConfig, "apiKey">> = {
  model: "claude-sonnet-4-5-20250929",
  temperature: 0.1,
  maxTokens: 4096,
  maxRetries: 1,
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ExtractionSuccess {
  ok: true;
  profile: ToolIntelligenceProfile;
  attempts: number;
}

export interface ExtractionError {
  ok: false;
  /** Validation errors from the last attempt */
  errors: string[];
  /** Raw LLM output from the last attempt (for debugging / manual review) */
  rawOutput?: string;
  attempts: number;
}

export type ExtractionResult = ExtractionSuccess | ExtractionError;

// ---------------------------------------------------------------------------
// Core extraction logic (pure — accepts an LLM caller for testability)
// ---------------------------------------------------------------------------

/**
 * A callable that takes system + user prompts and returns the raw
 * LLM text response. Used to decouple extraction logic from the
 * Anthropic SDK so we can test without network calls.
 */
export type LLMCaller = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;

/**
 * Create an LLMCaller backed by the Anthropic SDK.
 */
export function createAnthropicCaller(cfg: ExtractionConfig): LLMCaller {
  const apiKey = cfg.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic API key is required. Set ANTHROPIC_API_KEY env var or pass apiKey in config.",
    );
  }

  const client = new Anthropic({ apiKey });
  const model = cfg.model ?? DEFAULT_CONFIG.model;
  const temperature = cfg.temperature ?? DEFAULT_CONFIG.temperature;
  const maxTokens = cfg.maxTokens ?? DEFAULT_CONFIG.maxTokens;

  return async (systemPrompt: string, userPrompt: string) => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract text from response content blocks
    const textBlocks = response.content.filter(
      (block) => block.type === "text",
    );
    if (textBlocks.length === 0) {
      throw new Error("LLM returned no text content blocks");
    }
    return textBlocks.map((b) => b.text).join("");
  };
}

/**
 * Parse raw LLM text into a JSON value. Handles cases where the model
 * wraps JSON in markdown code fences.
 */
export function parseJsonResponse(raw: string): unknown {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3).trimEnd();
    }
  }

  return JSON.parse(cleaned);
}

/**
 * Run the full extraction pipeline: build prompt → call LLM → parse →
 * validate → retry if needed.
 */
export async function extractToolIntelligence(
  request: ExtractionRequest,
  caller: LLMCaller,
  config?: Partial<Pick<ExtractionConfig, "maxRetries">>,
): Promise<ExtractionResult> {
  const maxRetries = config?.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  const userPrompt = buildUserPrompt(request);

  let lastErrors: string[] = [];
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= 1 + maxRetries; attempt++) {
    try {
      const raw = await caller(SYSTEM_PROMPT, userPrompt);
      lastRaw = raw;

      const parsed = parseJsonResponse(raw);
      const result: ValidationResult = validateProfile(parsed);

      if (result.valid) {
        return { ok: true, profile: result.profile, attempts: attempt };
      }

      lastErrors = (result as ValidationFailure).errors;
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
 * One-call convenience: creates the Anthropic caller and runs extraction.
 */
export async function analyzeAITool(
  request: ExtractionRequest,
  config?: ExtractionConfig,
): Promise<ExtractionResult> {
  const caller = createAnthropicCaller(config ?? {});
  return extractToolIntelligence(request, caller, config);
}
