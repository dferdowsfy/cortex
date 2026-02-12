/**
 * Tests for the classification Zod schemas.
 */
import { describe, it, expect } from "vitest";
import {
  RiskClassificationSchema,
  ClassificationRequestSchema,
  EnrichmentAnswerSchema,
} from "../classificationSchema.js";
import {
  validChatGPTClassification,
  fullEnrichmentRequest,
  partialEnrichmentRequest,
  emptyEnrichmentRequest,
  classificationWithScores,
} from "./classificationFixtures.js";

// ---------------------------------------------------------------------------
// ClassificationRequestSchema
// ---------------------------------------------------------------------------

describe("ClassificationRequestSchema", () => {
  it("parses full enrichment request", () => {
    const result = ClassificationRequestSchema.parse(fullEnrichmentRequest());
    expect(result.enrichment_answers).toHaveLength(3);
    expect(result.unanswered_question_ids).toHaveLength(0);
  });

  it("parses partial enrichment request", () => {
    const result = ClassificationRequestSchema.parse(partialEnrichmentRequest());
    expect(result.enrichment_answers).toHaveLength(1);
    expect(result.unanswered_question_ids).toHaveLength(2);
  });

  it("parses empty enrichment request", () => {
    const result = ClassificationRequestSchema.parse(emptyEnrichmentRequest());
    expect(result.enrichment_answers).toHaveLength(0);
    expect(result.unanswered_question_ids).toHaveLength(3);
  });

  it("accepts string answer", () => {
    const answer = EnrichmentAnswerSchema.parse({
      question_id: "eq_01",
      question: "How many?",
      answer: "21-50",
    });
    expect(answer.answer).toBe("21-50");
  });

  it("accepts array answer", () => {
    const answer = EnrichmentAnswerSchema.parse({
      question_id: "eq_02",
      question: "What types?",
      answer: ["Internal docs", "Client data"],
    });
    expect(answer.answer).toEqual(["Internal docs", "Client data"]);
  });
});

// ---------------------------------------------------------------------------
// RiskClassificationSchema
// ---------------------------------------------------------------------------

describe("RiskClassificationSchema", () => {
  it("accepts a valid full classification", () => {
    const result = RiskClassificationSchema.parse(validChatGPTClassification());
    expect(result.classification.tool_name).toBe("ChatGPT");
  });

  it("rejects score out of range", () => {
    const c = validChatGPTClassification();
    c.classification.dimensions.data_sensitivity.score = 6;
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects score below minimum", () => {
    const c = classificationWithScores(1, 1, 1, 1);
    c.classification.dimensions.data_sensitivity.score = 0;
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects invalid governance level", () => {
    const c = validChatGPTClassification();
    (c.classification.governance_status as { level: string }).level = "Unknown";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects invalid overall tier", () => {
    const c = validChatGPTClassification();
    (c.classification.overall_risk as { tier: string }).tier = "Extreme";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects invalid assessment_type", () => {
    const c = validChatGPTClassification();
    (c.classification as { assessment_type: string }).assessment_type = "partial";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects wrong schema_version", () => {
    const c = validChatGPTClassification();
    (c.metadata as { schema_version: string }).schema_version = "2.0";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects wrong prompt_version", () => {
    const c = validChatGPTClassification();
    (c.metadata as { prompt_version: string }).prompt_version = "wrong_v1";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects wrong rubric_version", () => {
    const c = validChatGPTClassification();
    (c.metadata as { rubric_version: string }).rubric_version = "wrong";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects invalid input_basis", () => {
    const c = validChatGPTClassification();
    (c.classification.dimensions.data_sensitivity as { input_basis: string }).input_basis = "manual";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("rejects invalid assessment_confidence", () => {
    const c = validChatGPTClassification();
    (c.classification.enrichment_coverage as { assessment_confidence: string }).assessment_confidence = "Very High";
    expect(() => RiskClassificationSchema.parse(c)).toThrow();
  });

  it("accepts null reassessment fields for initial assessment", () => {
    const c = validChatGPTClassification();
    expect(c.reassessment_comparison.previous_tier).toBeNull();
    expect(c.reassessment_comparison.change_summary).toBeNull();
    expect(RiskClassificationSchema.parse(c)).toBeDefined();
  });
});
