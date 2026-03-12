/**
 * Complyze Prompt 4: Recommendation Engine
 * Service layer for generating remediation plans.
 * All LLM calls route through the Ollama model on the VPS.
 */

import { createOllamaCaller, type OllamaCallerConfig } from "./ollamaCaller.js";
import {
  RecommendationRequestSchema,
  RecommendationResponseSchema,
  type RecommendationRequest,
  type RecommendationResponse,
} from "./recommendationSchema.js";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "./recommendationPrompts.js";
import { validateRecommendationPlan } from "./recommendationValidation.js";

/**
 * LLM caller abstraction for dependency injection
 */
export type LLMCaller = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

/**
 * Parse and validate JSON response from LLM
 */
function parseJsonResponse(jsonString: string): {
  ok: boolean;
  data?: any;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    return { ok: true, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to parse JSON response",
    };
  }
}

/**
 * Generate remediation plan for an AI tool
 * Uses retry logic if validation fails
 */
export async function generateRecommendations(
  request: RecommendationRequest,
  llmCaller: LLMCaller,
  maxRetries = 3
): Promise<
  | { ok: true; data: RecommendationResponse }
  | { ok: false; error: string; validationErrors?: string[] }
> {
  // Validate input
  const requestValidation = RecommendationRequestSchema.safeParse(request);
  if (!requestValidation.success) {
    return {
      ok: false,
      error: `Invalid request: ${requestValidation.error.message}`,
    };
  }

  const userPrompt = buildRecommendationUserPrompt(request);

  let lastError = "";
  let lastValidationErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const responseText = await llmCaller(
        RECOMMENDATION_SYSTEM_PROMPT,
        userPrompt
      );

      // Parse JSON
      const parseResult = parseJsonResponse(responseText);
      if (!parseResult.ok) {
        lastError = parseResult.error!;
        continue;
      }

      // Validate against Zod schema
      const schemaValidation =
        RecommendationResponseSchema.safeParse(parseResult.data);
      if (!schemaValidation.success) {
        lastError = `Schema validation failed: ${schemaValidation.error.message}`;
        continue;
      }

      const response = schemaValidation.data;

      // Validate business rules
      const businessValidation = validateRecommendationPlan(
        response,
        request.flag_report
      );
      if (!businessValidation.valid) {
        lastError = "Business rule validation failed";
        lastValidationErrors = businessValidation.errors;
        continue;
      }

      // Success!
      return { ok: true, data: response };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "Unknown error during recommendation generation";
    }
  }

  return {
    ok: false,
    error: `Failed after ${maxRetries} attempts. Last error: ${lastError}`,
    validationErrors:
      lastValidationErrors.length > 0 ? lastValidationErrors : undefined,
  };
}

/**
 * Create Ollama LLM caller for recommendation generation.
 * Routes through the Ollama model hosted on the VPS.
 */
export function createRecommendationCaller(config?: OllamaCallerConfig): LLMCaller {
  return createOllamaCaller(config);
}

/**
 * Convenience function: generate recommendations using Ollama API
 */
export async function analyzeToolRecommendations(
  request: RecommendationRequest,
  _config?: OllamaCallerConfig,
  maxRetries = 3
): Promise<
  | { ok: true; data: RecommendationResponse }
  | { ok: false; error: string; validationErrors?: string[] }
> {
  const caller = createRecommendationCaller(_config);
  return generateRecommendations(request, caller, maxRetries);
}
