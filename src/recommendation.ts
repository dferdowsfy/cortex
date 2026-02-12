/**
 * Complyze Prompt 4: Recommendation Engine
 * Service layer for generating remediation plans
 */

import Anthropic from "@anthropic-ai/sdk";
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
 * Create Anthropic LLM caller with Claude Sonnet
 * Temperature 0.2 per spec (slightly higher for natural language recommendations)
 */
export function createAnthropicCaller(apiKey: string): LLMCaller {
  const client = new Anthropic({ apiKey });

  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 5000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const firstBlock = response.content[0];
    if (firstBlock.type !== "text") {
      throw new Error("Expected text response from Claude");
    }

    return firstBlock.text;
  };
}

/**
 * Convenience function: generate recommendations using Anthropic API
 */
export async function analyzeToolRecommendations(
  request: RecommendationRequest,
  anthropicApiKey: string,
  maxRetries = 3
): Promise<
  | { ok: true; data: RecommendationResponse }
  | { ok: false; error: string; validationErrors?: string[] }
> {
  const caller = createAnthropicCaller(anthropicApiKey);
  return generateRecommendations(request, caller, maxRetries);
}
