/**
 * openrouter.ts — legacy compatibility shim
 *
 * All LLM inference now routes through the remotely-hosted `complyze-qwen`
 * model on the Complyze VPS via OLLAMA_BASE_URL.
 * This file re-exports the Ollama-backed callLLM and parseJSON so that existing
 * callers (extract, assess, report routes) need no import-path changes.
 *
 * The OpenRouter API is no longer used. OPENROUTER_API_KEY is no longer required.
 */

import { callOllama } from "@/lib/ollamaAnalysis";

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Drop-in replacement for the previous OpenRouter callLLM.
 * Combines system + user prompts into a single Ollama `prompt` string.
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  _options: LLMOptions = {},
): Promise<string> {
  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  return callOllama(combinedPrompt);
}

/**
 * Parse JSON from LLM response, handling markdown code fences.
 */
export function parseJSON(raw: string): unknown {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return JSON.parse(cleaned);
}
