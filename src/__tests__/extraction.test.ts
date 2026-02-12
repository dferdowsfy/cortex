/**
 * Tests for the extraction service (LLM integration mocked).
 */
import { describe, it, expect, vi } from "vitest";
import {
  extractToolIntelligence,
  parseJsonResponse,
  createAnthropicCaller,
  type LLMCaller,
} from "../extraction.js";
import { validChatGPTProfile, chatGPTRequest } from "./fixtures.js";

// ---------------------------------------------------------------------------
// parseJsonResponse
// ---------------------------------------------------------------------------

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    const obj = { key: "value" };
    expect(parseJsonResponse(JSON.stringify(obj))).toEqual(obj);
  });

  it("strips markdown code fences", () => {
    const obj = { key: "value" };
    const wrapped = "```json\n" + JSON.stringify(obj) + "\n```";
    expect(parseJsonResponse(wrapped)).toEqual(obj);
  });

  it("handles leading/trailing whitespace", () => {
    const obj = { a: 1 };
    expect(parseJsonResponse("  \n" + JSON.stringify(obj) + "  \n")).toEqual(obj);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("not json")).toThrow();
  });

  it("handles code fence without language tag", () => {
    const obj = { key: "value" };
    const wrapped = "```\n" + JSON.stringify(obj) + "\n```";
    expect(parseJsonResponse(wrapped)).toEqual(obj);
  });
});

// ---------------------------------------------------------------------------
// extractToolIntelligence
// ---------------------------------------------------------------------------

describe("extractToolIntelligence", () => {
  it("returns success on valid LLM output", async () => {
    const mockCaller: LLMCaller = vi.fn().mockResolvedValue(
      JSON.stringify(validChatGPTProfile()),
    );

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.tool_profile.tool_name).toBe("ChatGPT");
      expect(result.attempts).toBe(1);
    }
    expect(mockCaller).toHaveBeenCalledTimes(1);
  });

  it("retries once on validation failure then fails", async () => {
    const badProfile = {
      ...validChatGPTProfile(),
      metadata: {
        ...validChatGPTProfile().metadata,
        schema_version: "99.0", // invalid
      },
    };
    const mockCaller: LLMCaller = vi.fn().mockResolvedValue(
      JSON.stringify(badProfile),
    );

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller, {
      maxRetries: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rawOutput).toBeDefined();
    }
    expect(mockCaller).toHaveBeenCalledTimes(2);
  });

  it("retries on JSON parse error then succeeds if second attempt is valid", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce(JSON.stringify(validChatGPTProfile()));

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller, {
      maxRetries: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
    }
  });

  it("retries on LLM call failure then succeeds", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockRejectedValueOnce(new Error("API rate limit"))
      .mockResolvedValueOnce(JSON.stringify(validChatGPTProfile()));

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller, {
      maxRetries: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
    }
  });

  it("returns failure when all retries are exhausted", async () => {
    const mockCaller: LLMCaller = vi
      .fn()
      .mockRejectedValue(new Error("API down"));

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller, {
      maxRetries: 2,
    });

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

    const result = await extractToolIntelligence(chatGPTRequest(), mockCaller, {
      maxRetries: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(1);
    }
    expect(mockCaller).toHaveBeenCalledTimes(1);
  });

  it("passes system and user prompts to the caller", async () => {
    const mockCaller: LLMCaller = vi.fn().mockResolvedValue(
      JSON.stringify(validChatGPTProfile()),
    );

    await extractToolIntelligence(chatGPTRequest(), mockCaller);

    const [systemPrompt, userPrompt] = (mockCaller as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(systemPrompt).toContain("Complyze Intelligence");
    expect(userPrompt).toContain("TOOL NAME: ChatGPT");
  });
});

// ---------------------------------------------------------------------------
// createAnthropicCaller
// ---------------------------------------------------------------------------

describe("createAnthropicCaller", () => {
  it("throws if no API key is provided and env var is unset", () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => createAnthropicCaller({})).toThrow("API key is required");

    // Restore env
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });
});
