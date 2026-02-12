/**
 * Tests for the classification validation layer (business rules).
 */
import { describe, it, expect } from "vitest";
import {
  validateClassification,
  computeClassificationTier,
  expectedDirection,
} from "../classificationValidation.js";
import {
  validChatGPTClassification,
  classificationWithScores,
} from "./classificationFixtures.js";

// ---------------------------------------------------------------------------
// computeClassificationTier
// ---------------------------------------------------------------------------

describe("computeClassificationTier", () => {
  it("returns Low for low scores", () => {
    const r = computeClassificationTier(1, 1, 1, 1, "Managed");
    expect(r.tier).toBe("Low");
    expect(r.tierFromAverage).toBe("Low");
    expect(r.average).toBe(1.0);
  });

  it("returns Moderate for moderate scores", () => {
    const r = computeClassificationTier(3, 3, 2, 2, "Managed");
    expect(r.tier).toBe("Moderate");
    expect(r.average).toBe(2.5);
  });

  it("returns High for high scores", () => {
    const r = computeClassificationTier(4, 4, 3, 3, "Managed");
    expect(r.tier).toBe("High");
    expect(r.average).toBe(3.5);
  });

  it("returns Critical for very high scores", () => {
    const r = computeClassificationTier(5, 5, 4, 4, "Managed");
    expect(r.tier).toBe("Critical");
  });

  // Override 1: any dimension = 5 → minimum High
  it("overrides to High when any dimension is 5 and average is low", () => {
    const r = computeClassificationTier(5, 1, 1, 1, "Managed");
    expect(r.tierFromAverage).toBe("Low");
    expect(r.tier).toBe("High"); // override for DS=5, but HO < 4 so not Critical
  });

  // Override 2: DS=5 AND HO>=4 → Critical
  it("overrides to Critical when DS=5 and HO>=4", () => {
    const r = computeClassificationTier(5, 1, 1, 4, "Managed");
    expect(r.tier).toBe("Critical");
  });

  it("overrides to Critical when DS=5 and HO=5", () => {
    const r = computeClassificationTier(5, 2, 2, 5, "Managed");
    expect(r.tier).toBe("Critical");
  });

  it("does not trigger Critical override when DS=5 and HO=3", () => {
    const r = computeClassificationTier(5, 1, 1, 3, "Managed");
    expect(r.tier).toBe("High"); // Override 1 applies, but not Override 2
  });

  // Override 3: Shadow AI → minimum High
  it("overrides to High when governance is Shadow AI and average is low", () => {
    const r = computeClassificationTier(2, 2, 1, 1, "Shadow AI");
    expect(r.tierFromAverage).toBe("Low");
    expect(r.tier).toBe("High");
  });

  it("does not downgrade existing High/Critical for Shadow AI", () => {
    const r = computeClassificationTier(4, 4, 4, 4, "Shadow AI");
    expect(r.tier).toBe("High");
  });

  // Combined overrides
  it("DS=5 + HO=4 + Shadow AI → Critical (Critical wins)", () => {
    const r = computeClassificationTier(5, 1, 1, 4, "Shadow AI");
    expect(r.tier).toBe("Critical");
  });
});

// ---------------------------------------------------------------------------
// expectedDirection
// ---------------------------------------------------------------------------

describe("expectedDirection", () => {
  it("returns increased", () => {
    expect(expectedDirection(3, 5)).toBe("increased");
  });

  it("returns decreased", () => {
    expect(expectedDirection(4, 2)).toBe("decreased");
  });

  it("returns unchanged", () => {
    expect(expectedDirection(3, 3)).toBe("unchanged");
  });
});

// ---------------------------------------------------------------------------
// validateClassification — valid input
// ---------------------------------------------------------------------------

describe("validateClassification", () => {
  it("accepts a valid classification", () => {
    const result = validateClassification(validChatGPTClassification());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.classification.classification.tool_name).toBe("ChatGPT");
    }
  });

  it("accepts multiple valid score combinations", () => {
    for (const [ds, di, ap, ho] of [
      [1, 1, 1, 1],
      [2, 2, 2, 2],
      [3, 3, 3, 3],
      [4, 4, 4, 4],
      [5, 5, 5, 5],
    ]) {
      const result = validateClassification(
        classificationWithScores(ds, di, ap, ho),
      );
      expect(result.valid).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Structural errors
  // -----------------------------------------------------------------------

  it("rejects non-object input", () => {
    const result = validateClassification("not json");
    expect(result.valid).toBe(false);
  });

  it("rejects null input", () => {
    const result = validateClassification(null);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Business rule: score = base + modifiers
  // -----------------------------------------------------------------------

  it("rejects when final score does not match base + modifiers", () => {
    const c = validChatGPTClassification();
    // DS has base=4, modifier +1, so score should be 5
    c.classification.dimensions.data_sensitivity.score = 3;
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("data_sensitivity"))).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Business rule: dimension average
  // -----------------------------------------------------------------------

  it("rejects when dimension_average is wrong", () => {
    const c = classificationWithScores(4, 4, 4, 4);
    c.classification.overall_risk.dimension_average = 3.0; // wrong, should be 4.0
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("dimension_average"))).toBe(
        true,
      );
    }
  });

  // -----------------------------------------------------------------------
  // Business rule: tier too low
  // -----------------------------------------------------------------------

  it("rejects tier below rubric minimum (override: any dim=5)", () => {
    const c = classificationWithScores(5, 1, 1, 1);
    c.classification.overall_risk.tier = "Low"; // should be at least High
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("below the minimum"))).toBe(
        true,
      );
    }
  });

  it("rejects tier below Critical when DS=5 and HO>=4", () => {
    const c = classificationWithScores(5, 1, 1, 4);
    c.classification.overall_risk.tier = "High"; // should be Critical
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Business rule: score comparison direction
  // -----------------------------------------------------------------------

  it("rejects wrong direction in score comparison", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.classification.score_comparison_to_defaults.data_sensitivity_change = {
      default_score: 2,
      final_score: 3,
      direction: "decreased", // wrong, should be "increased"
      reason: "Test",
    };
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("direction")),
      ).toBe(true);
    }
  });

  it("rejects when final_score in comparison doesn't match dimension score", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.classification.score_comparison_to_defaults.data_sensitivity_change.final_score = 5;
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("final_score"))).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Business rule: enrichment coverage math
  // -----------------------------------------------------------------------

  it("rejects when coverage counts don't add up", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.classification.enrichment_coverage.questions_answered = 5;
    c.classification.enrichment_coverage.questions_unanswered = 3;
    c.classification.enrichment_coverage.questions_total = 3; // 5+3 != 3
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Enrichment coverage"))).toBe(
        true,
      );
    }
  });

  // -----------------------------------------------------------------------
  // Business rule: assessment confidence consistency
  // -----------------------------------------------------------------------

  it("rejects High confidence when less than half questions answered", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.classification.enrichment_coverage.questions_total = 6;
    c.classification.enrichment_coverage.questions_answered = 2;
    c.classification.enrichment_coverage.questions_unanswered = 4;
    c.classification.enrichment_coverage.assessment_confidence = "High";
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
  });

  it("rejects non-High confidence when all questions answered", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.classification.enrichment_coverage.assessment_confidence = "Medium";
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Business rule: reassessment consistency
  // -----------------------------------------------------------------------

  it("rejects assessment_type=reassessment with is_reassessment=false", () => {
    const c = classificationWithScores(3, 3, 3, 3, "Managed", "reassessment");
    c.reassessment_comparison.is_reassessment = false;
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
  });

  it("rejects assessment_type=initial with is_reassessment=true", () => {
    const c = classificationWithScores(3, 3, 3, 3);
    c.reassessment_comparison.is_reassessment = true;
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Business rule: tier_from_average
  // -----------------------------------------------------------------------

  it("rejects wrong tier_from_average", () => {
    const c = classificationWithScores(3, 3, 3, 3); // avg 3.0 → Moderate
    c.classification.overall_risk.tier_from_average = "High";
    const result = validateClassification(c);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("tier_from_average"))).toBe(
        true,
      );
    }
  });
});
