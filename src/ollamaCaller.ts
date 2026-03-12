/**
 * Ollama LLM Caller — Complyze
 *
 * Generic Ollama-backed LLM caller that replaces the Anthropic SDK.
 * All LLM calls go through the Ollama model hosted on the VPS.
 *
 * Required env vars (when caller config not provided explicitly):
 *   OLLAMA_BASE_URL   — e.g. http://72.62.83.236:11434
 *   OLLAMA_MODEL      — e.g. complyze-qwen
 *   OLLAMA_TIMEOUT_MS — e.g. 60000 (optional, defaults to 60000)
 */

/* eslint-disable no-var */
declare var process: { env: Record<string, string | undefined> };
declare function fetch(url: string, init?: Record<string, unknown>): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
declare function setTimeout(cb: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;
declare class AbortController { abort(): void; signal: unknown; }

export type LLMCaller = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;

export interface OllamaCallerConfig {
  /** Override OLLAMA_BASE_URL env var */
  baseUrl?: string;
  /** Override OLLAMA_MODEL env var */
  model?: string;
  /** Timeout in ms. Defaults to OLLAMA_TIMEOUT_MS or 60000 */
  timeoutMs?: number;
}

function resolveConfig(cfg?: OllamaCallerConfig) {
  const baseUrl = (cfg?.baseUrl || process.env.OLLAMA_BASE_URL || "").trim().replace(/\/$/, "");
  const model = (cfg?.model || process.env.OLLAMA_MODEL || "").trim();
  const timeoutMs = cfg?.timeoutMs ?? parseInt(process.env.OLLAMA_TIMEOUT_MS || "60000", 10);

  if (!baseUrl) {
    throw new Error(
      "OLLAMA_BASE_URL is not set. Example: OLLAMA_BASE_URL=http://72.62.83.236:11434",
    );
  }
  if (!model) {
    throw new Error(
      "OLLAMA_MODEL is not set. Example: OLLAMA_MODEL=complyze-qwen",
    );
  }

  return { baseUrl, model, timeoutMs: isNaN(timeoutMs) ? 60_000 : timeoutMs };
}

/**
 * Create an LLMCaller backed by the Ollama API on the VPS.
 * Combines system + user prompts into a single Ollama prompt.
 */
export function createOllamaCaller(cfg?: OllamaCallerConfig): LLMCaller {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const { baseUrl, model, timeoutMs } = resolveConfig(cfg);
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const body = JSON.stringify({
      model,
      prompt: combinedPrompt,
      stream: false,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: { ok: boolean; status: number; text(): Promise<string> };
    try {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: (controller as unknown as Record<string, unknown>).signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const raw = await res.text();
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
  };
}
