/**
 * Tests for classification prompt construction.
 */
import { describe, it, expect } from "vitest";
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
} from "../classificationPrompts.js";
import { validChatGPTProfile } from "./fixtures.js";
import {
  fullEnrichmentRequest,
  partialEnrichmentRequest,
  validChatGPTClassification,
} from "./classificationFixtures.js";

describe("CLASSIFICATION_SYSTEM_PROMPT", () => {
  it("contains core principles", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DETERMINISTIC SCORING");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("ENRICHMENT DATA OVERRIDES DEFAULTS");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("WORST-CASE INPUTS DRIVE SCORING");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("PLAIN LANGUAGE JUSTIFICATIONS");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("GOVERNANCE STATUS IS A SEPARATE DIMENSION");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("STRUCTURED OUTPUT");
  });

  it("contains all five dimension rubrics", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DIMENSION 1: DATA SENSITIVITY");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DIMENSION 2: DECISION IMPACT");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DIMENSION 3: AFFECTED PARTIES");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DIMENSION 4: HUMAN OVERSIGHT");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("DIMENSION 5: GOVERNANCE STATUS");
  });

  it("contains overall tier calculation with all overrides", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("OVERALL RISK TIER CALCULATION");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("If ANY dimension = 5");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("data_sensitivity = 5 AND human_oversight >= 4");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("Shadow AI");
  });

  it("contains change tracking instructions", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("CHANGE TRACKING");
  });

  it("specifies JSON-only response format", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain(
      "Return ONLY a single valid JSON object",
    );
  });

  it("specifies required literal versions", () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("risk_classification_v1");
    expect(CLASSIFICATION_SYSTEM_PROMPT).toContain("complyze_rubric_v1");
  });
});

describe("buildClassificationUserPrompt", () => {
  it("includes tool profile JSON", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
    );
    expect(prompt).toContain("TOOL PROFILE (from Prompt 1):");
    expect(prompt).toContain('"tool_name": "ChatGPT"');
  });

  it("includes enrichment answers", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
    );
    expect(prompt).toContain("ENRICHMENT ANSWERS:");
    expect(prompt).toContain("eq_01");
    expect(prompt).toContain("21-50");
  });

  it("includes unanswered questions", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      partialEnrichmentRequest(),
    );
    expect(prompt).toContain("UNANSWERED QUESTIONS:");
    expect(prompt).toContain("eq_02");
    expect(prompt).toContain("eq_03");
  });

  it("includes previous classification for reassessment", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
      validChatGPTClassification(),
    );
    expect(prompt).toContain("PREVIOUS CLASSIFICATION:");
    expect(prompt).toContain("This is a reassessment");
  });

  it("does not include previous classification for initial assessment", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
    );
    expect(prompt).not.toContain("PREVIOUS CLASSIFICATION:");
  });

  it("ends with rubric application instruction", () => {
    const prompt = buildClassificationUserPrompt(
      validChatGPTProfile(),
      fullEnrichmentRequest(),
    );
    expect(prompt).toContain(
      "Apply the Complyze Risk Classification Rubric",
    );
  });
});
