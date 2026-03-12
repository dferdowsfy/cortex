/**
 * openrouter.ts — legacy compatibility shim
 *
 * All LLM inference now routes through the Ollama model on the VPS
 * via OLLAMA_BASE_URL (e.g. http://72.62.83.236:11434).
 * This file re-exports the Ollama-backed callLLM and parseJSON so that existing
 * callers (extract, assess, report routes) need no import-path changes.
 *
 * No external LLM providers are used. No OpenRouter, OpenAI, or Anthropic calls.
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
