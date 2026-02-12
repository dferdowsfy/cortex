/**
 * Tests for prompt construction.
 */
import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT } from "../prompts.js";
import { chatGPTRequest } from "./fixtures.js";

describe("SYSTEM_PROMPT", () => {
  it("contains required core principles", () => {
    expect(SYSTEM_PROMPT).toContain("ACCURACY OVER COMPLETENESS");
    expect(SYSTEM_PROMPT).toContain("CONSERVATIVE RISK DEFAULTS");
    expect(SYSTEM_PROMPT).toContain("TIER AND PLAN SPECIFICITY");
    expect(SYSTEM_PROMPT).toContain("PLAIN LANGUAGE");
    expect(SYSTEM_PROMPT).toContain("STRUCTURED OUTPUT");
    expect(SYSTEM_PROMPT).toContain("CURRENT KNOWLEDGE");
  });

  it("contains the scoring rubric", () => {
    expect(SYSTEM_PROMPT).toContain("DATA SENSITIVITY DEFAULT (1-5)");
    expect(SYSTEM_PROMPT).toContain("DECISION IMPACT DEFAULT (1-5)");
    expect(SYSTEM_PROMPT).toContain("AFFECTED PARTIES DEFAULT (1-5)");
    expect(SYSTEM_PROMPT).toContain("HUMAN OVERSIGHT DEFAULT (1-5");
    expect(SYSTEM_PROMPT).toContain("OVERALL DEFAULT TIER");
    expect(SYSTEM_PROMPT).toContain("OVERRIDE");
  });

  it("contains instructions for unknown tools", () => {
    expect(SYSTEM_PROMPT).toContain("HANDLING UNKNOWN TOOLS");
    expect(SYSTEM_PROMPT).toContain("Limited Public Information Available");
  });

  it("contains instructions for embedded AI", () => {
    expect(SYSTEM_PROMPT).toContain("HANDLING EMBEDDED AI");
  });

  it("specifies JSON-only response format", () => {
    expect(SYSTEM_PROMPT).toContain("Return ONLY a single valid JSON object");
  });
});

describe("buildUserPrompt", () => {
  it("includes all request fields in the output", () => {
    const prompt = buildUserPrompt(chatGPTRequest());
    expect(prompt).toContain("TOOL NAME: ChatGPT");
    expect(prompt).toContain("VENDOR: OpenAI");
    expect(prompt).toContain("TIER/PLAN: Free");
    expect(prompt).toContain("ADDITIONAL CONTEXT: None");
  });

  it("includes additional_context when provided", () => {
    const prompt = buildUserPrompt({
      tool_name: "Notion AI",
      vendor: "Notion Labs",
      tier: "Team",
      additional_context: "Only used by marketing for blog posts",
    });
    expect(prompt).toContain(
      "ADDITIONAL CONTEXT: Only used by marketing for blog posts",
    );
    expect(prompt).not.toContain("ADDITIONAL CONTEXT: None");
  });

  it("uses defaults for missing vendor/tier", () => {
    const prompt = buildUserPrompt({
      tool_name: "SomeAI",
      vendor: "Unknown",
      tier: "Not specified",
    });
    expect(prompt).toContain("VENDOR: Unknown");
    expect(prompt).toContain("TIER/PLAN: Not specified");
  });

  it("ends with the schema instruction", () => {
    const prompt = buildUserPrompt(chatGPTRequest());
    expect(prompt).toContain(
      "Return a JSON object matching the Complyze Tool Intelligence Schema.",
    );
  });
});
