/**
 * Tests for the classification service (LLM integration mocked).
 */
import { describe, it, expect, vi } from "vitest";
import { classifyToolRisk } from "../classification.js";
import type { LLMCaller } from "../extraction.js";
import { validChatGPTProfile } from "./fixtures.js";
import {
  fullEnrichmentRequest,
  validChatGPTClassification,
} from "./classificationFixtures.js";

describe("classifyToolRisk", () => {
  it("returns success on valid LLM output", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValue(JSON.stringify(validChatGPTClassification()));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.classification.classification.tool_name).toBe("ChatGPT");
      expect(result.attempts).toBe(1);
    }
    expect(mockCaller).toHaveBeenCalledTimes(1);
  });

  it("retries once on validation failure then fails", async () => {
    const bad = validChatGPTClassification();
    (bad.metadata as { schema_version: string }).schema_version = "99.0";
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValue(JSON.stringify(bad));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { maxRetries: 1 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(mockCaller).toHaveBeenCalledTimes(2);
  });

  it("retries on JSON parse error then succeeds", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify(validChatGPTClassification()));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { maxRetries: 1 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
    }
  });

  it("retries on LLM call failure then succeeds", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockRejectedValueOnce(new Error("API timeout"))
      .mockResolvedValueOnce(JSON.stringify(validChatGPTClassification()));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { maxRetries: 1 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
    }
  });

  it("returns failure when all retries exhausted", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockRejectedValue(new Error("API down"));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { maxRetries: 2 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(3);
      expect(result.errors[0]).toContain("LLM call failed");
    }
  });

  it("respects maxRetries = 0 (no retries)", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockRejectedValue(new Error("fail"));

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { maxRetries: 0 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(1);
    }
    expect(mockCaller).toHaveBeenCalledTimes(1);
  });

  it("passes system and user prompts to the caller", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValue(JSON.stringify(validChatGPTClassification()));

    await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
    );

    const [systemPrompt, userPrompt] = (
      mockCaller as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(systemPrompt).toContain("Complyze Risk Classifier");
    expect(userPrompt).toContain("ChatGPT");
  });

  it("includes previous classification for reassessment", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValue(JSON.stringify(validChatGPTClassification()));

    await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
      { previousClassification: validChatGPTClassification() },
    );

    const [, userPrompt] = (mockCaller as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(userPrompt).toContain("PREVIOUS CLASSIFICATION:");
    expect(userPrompt).toContain("This is a reassessment");
  });

  it("handles markdown code fences in LLM output", async () => {
    const json = JSON.stringify(validChatGPTClassification());
    const wrapped = "```json\n" + json + "\n```";
    const mockCaller: LLMCaller = vi.fn().mockResolvedValue(wrapped);

    const result = await classifyToolRisk(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      mockCaller,
    );

    expect(result.ok).toBe(true);
  });
});
