/**
 * Tests for the Zod schema definitions.
 */
import { describe, it, expect } from "vitest";
import {
  ToolIntelligenceProfileSchema,
  ExtractionRequestSchema,
  ToolProfileSchema,
  DataHandlingSchema,
  SecurityPostureSchema,
  DefaultRiskAssessmentSchema,
  RiskFlagSchema,
  EnrichmentQuestionSchema,
  MetadataSchema,
} from "../schema.js";
import { validChatGPTProfile } from "./fixtures.js";

describe("ExtractionRequestSchema", () => {
  it("parses a complete request", () => {
    const result = ExtractionRequestSchema.parse({
      tool_name: "ChatGPT",
      vendor: "OpenAI",
      tier: "Free",
      additional_context: "Used by legal team",
    });
    expect(result.tool_name).toBe("ChatGPT");
    expect(result.additional_context).toBe("Used by legal team");
  });

  it("applies defaults for missing optional fields", () => {
    const result = ExtractionRequestSchema.parse({ tool_name: "FooAI" });
    expect(result.vendor).toBe("Unknown");
    expect(result.tier).toBe("Not specified");
    expect(result.additional_context).toBeUndefined();
  });

  it("rejects empty tool_name", () => {
    expect(() =>
      ExtractionRequestSchema.parse({ tool_name: "" }),
    ).toThrow();
  });
});

describe("ToolProfileSchema", () => {
  it("accepts a valid profile", () => {
    const profile = validChatGPTProfile().tool_profile;
    expect(ToolProfileSchema.parse(profile)).toEqual(profile);
  });

  it("rejects invalid category", () => {
    const profile = {
      ...validChatGPTProfile().tool_profile,
      category: "Invalid Category",
    };
    expect(() => ToolProfileSchema.parse(profile)).toThrow();
  });

  it("rejects invalid URL", () => {
    const profile = {
      ...validChatGPTProfile().tool_profile,
      website: "not-a-url",
    };
    expect(() => ToolProfileSchema.parse(profile)).toThrow();
  });

  it("rejects empty ai_capability_types", () => {
    const profile = {
      ...validChatGPTProfile().tool_profile,
      ai_capability_types: [],
    };
    expect(() => ToolProfileSchema.parse(profile)).toThrow();
  });
});

describe("DataHandlingSchema", () => {
  it("accepts valid data handling section", () => {
    const dh = validChatGPTProfile().data_handling;
    expect(DataHandlingSchema.parse(dh)).toEqual(dh);
  });

  it("rejects invalid trains_on_user_data value", () => {
    const dh = {
      ...validChatGPTProfile().data_handling,
      trains_on_user_data: {
        value: "Maybe",
        detail: "Who knows",
        confidence: "high",
      },
    };
    expect(() => DataHandlingSchema.parse(dh)).toThrow();
  });

  it("rejects invalid confidence value", () => {
    const dh = validChatGPTProfile().data_handling;
    const broken = {
      ...dh,
      data_encryption: { in_transit: "Yes", at_rest: "Yes", confidence: "very_high" },
    };
    expect(() => DataHandlingSchema.parse(broken)).toThrow();
  });
});

describe("SecurityPostureSchema", () => {
  it("accepts valid security posture", () => {
    const sp = validChatGPTProfile().security_posture;
    expect(SecurityPostureSchema.parse(sp)).toEqual(sp);
  });
});

describe("DefaultRiskAssessmentSchema", () => {
  it("accepts valid risk scores", () => {
    const ra = validChatGPTProfile().default_risk_assessment;
    expect(DefaultRiskAssessmentSchema.parse(ra)).toEqual(ra);
  });

  it("rejects score out of range (0)", () => {
    const ra = {
      ...validChatGPTProfile().default_risk_assessment,
      data_sensitivity_default: { score: 0, rationale: "test" },
    };
    expect(() => DefaultRiskAssessmentSchema.parse(ra)).toThrow();
  });

  it("rejects score out of range (6)", () => {
    const ra = {
      ...validChatGPTProfile().default_risk_assessment,
      data_sensitivity_default: { score: 6, rationale: "test" },
    };
    expect(() => DefaultRiskAssessmentSchema.parse(ra)).toThrow();
  });

  it("rejects non-integer score", () => {
    const ra = {
      ...validChatGPTProfile().default_risk_assessment,
      data_sensitivity_default: { score: 3.5, rationale: "test" },
    };
    expect(() => DefaultRiskAssessmentSchema.parse(ra)).toThrow();
  });
});

describe("RiskFlagSchema", () => {
  it("accepts valid flag", () => {
    const flag = validChatGPTProfile().known_risk_flags[0];
    expect(RiskFlagSchema.parse(flag)).toEqual(flag);
  });

  it("rejects invalid severity", () => {
    expect(() =>
      RiskFlagSchema.parse({
        flag: "Test",
        severity: "Extreme",
        description: "Some description that is long enough",
        source_confidence: "high",
      }),
    ).toThrow();
  });
});

describe("EnrichmentQuestionSchema", () => {
  it("accepts valid question", () => {
    const q = validChatGPTProfile().enrichment_questions[0];
    expect(EnrichmentQuestionSchema.parse(q)).toEqual(q);
  });

  it("rejects invalid answer_format", () => {
    const q = {
      ...validChatGPTProfile().enrichment_questions[0],
      answer_format: "free_text",
    };
    expect(() => EnrichmentQuestionSchema.parse(q)).toThrow();
  });

  it("rejects invalid risk_dimension_affected", () => {
    const q = {
      ...validChatGPTProfile().enrichment_questions[0],
      risk_dimension_affected: "budget",
    };
    expect(() => EnrichmentQuestionSchema.parse(q)).toThrow();
  });
});

describe("MetadataSchema", () => {
  it("accepts valid metadata", () => {
    const m = validChatGPTProfile().metadata;
    expect(MetadataSchema.parse(m)).toEqual(m);
  });

  it("rejects wrong schema_version", () => {
    expect(() =>
      MetadataSchema.parse({
        assessment_generated_at: "2026-02-12T00:00:00Z",
        schema_version: "2.0",
        overall_confidence: "high",
      }),
    ).toThrow();
  });
});

describe("ToolIntelligenceProfileSchema (full)", () => {
  it("accepts a complete valid profile", () => {
    const profile = validChatGPTProfile();
    expect(ToolIntelligenceProfileSchema.parse(profile)).toEqual(profile);
  });

  it("rejects profile with fewer than 1 risk flag", () => {
    const profile = { ...validChatGPTProfile(), known_risk_flags: [] };
    expect(() => ToolIntelligenceProfileSchema.parse(profile)).toThrow();
  });

  it("rejects profile with fewer than 3 enrichment questions", () => {
    const profile = {
      ...validChatGPTProfile(),
      enrichment_questions: [validChatGPTProfile().enrichment_questions[0]],
    };
    expect(() => ToolIntelligenceProfileSchema.parse(profile)).toThrow();
  });

  it("accepts null tier_upgrade_note", () => {
    const profile = { ...validChatGPTProfile(), tier_upgrade_note: null };
    expect(ToolIntelligenceProfileSchema.parse(profile).tier_upgrade_note).toBeNull();
  });
});
