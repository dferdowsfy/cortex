/**
 * Complyze Prompt 5: Board Summary Narrative
 * Service layer for generating executive-level portfolio risk reports
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  BoardSummaryRequestSchema,
  BoardSummaryResponseSchema,
  type BoardSummaryRequest,
  type BoardSummaryResponse,
} from "./boardSummarySchema.js";
import {
  BOARD_SUMMARY_SYSTEM_PROMPT,
  buildBoardSummaryUserPrompt,
} from "./boardSummaryPrompts.js";
import { validateBoardSummary } from "./boardSummaryValidation.js";

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
        error instanceof Error
          ? error.message
          : "Failed to parse JSON response",
    };
  }
}

/**
 * Result types for board summary generation
 */
export type BoardSummaryResult =
  | { ok: true; data: BoardSummaryResponse }
  | { ok: false; error: string; validationErrors?: string[] };

/**
 * Generate a board summary report for an AI portfolio
 * Uses retry logic if validation fails
 */
export async function generateBoardSummary(
  request: BoardSummaryRequest,
  llmCaller: LLMCaller,
  maxRetries = 3
): Promise<BoardSummaryResult> {
  // Validate input
  const requestValidation = BoardSummaryRequestSchema.safeParse(request);
  if (!requestValidation.success) {
    return {
      ok: false,
      error: `Invalid request: ${requestValidation.error.message}`,
    };
  }

  const userPrompt = buildBoardSummaryUserPrompt(request);

  let lastError = "";
  let lastValidationErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const responseText = await llmCaller(
        BOARD_SUMMARY_SYSTEM_PROMPT,
        userPrompt
      );

      // Parse JSON
      const parseResult = parseJsonResponse(responseText);
      if (!parseResult.ok) {
        lastError = parseResult.error!;
        continue;
      }

      // Validate against Zod schema
      const schemaValidation = BoardSummaryResponseSchema.safeParse(
        parseResult.data
      );
      if (!schemaValidation.success) {
        lastError = `Schema validation failed: ${schemaValidation.error.message}`;
        continue;
      }

      const response = schemaValidation.data;

      // Validate business rules
      const businessValidation = validateBoardSummary(response, request);
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
          : "Unknown error during board summary generation";
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
 * Temperature 0.3 per spec (highest in pipeline — narrative quality matters)
 * Max tokens 8000 (most text output in the pipeline)
 */
export function createAnthropicCaller(apiKey: string): LLMCaller {
  const client = new Anthropic({ apiKey });

  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      temperature: 0.3,
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
 * Convenience function: generate board summary using Anthropic API
 */
export async function generatePortfolioReport(
  request: BoardSummaryRequest,
  anthropicApiKey: string,
  maxRetries = 3
): Promise<BoardSummaryResult> {
  const caller = createAnthropicCaller(anthropicApiKey);
  return generateBoardSummary(request, caller, maxRetries);
}
