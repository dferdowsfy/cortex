/**
 * Tests for the validation layer (business rules + Zod).
 */
import { describe, it, expect } from "vitest";
import {
  validateProfile,
  computeExpectedTier,
} from "../validation.js";
import { validChatGPTProfile } from "./fixtures.js";

// ---------------------------------------------------------------------------
// computeExpectedTier
// ---------------------------------------------------------------------------

describe("computeExpectedTier", () => {
  it("returns Low for average ≤ 2.0", () => {
    expect(computeExpectedTier(1, 1, 1, 1)).toBe("Low");
    expect(computeExpectedTier(2, 2, 2, 2)).toBe("Low");
    expect(computeExpectedTier(1, 2, 2, 3)).toBe("Low"); // avg 2.0
  });

  it("returns Moderate for average 2.1–3.0", () => {
    expect(computeExpectedTier(2, 3, 3, 3)).toBe("Moderate"); // avg 2.75
    expect(computeExpectedTier(3, 3, 3, 3)).toBe("Moderate"); // avg 3.0
  });

  it("returns High for average 3.1–4.0", () => {
    expect(computeExpectedTier(4, 4, 3, 3)).toBe("High"); // avg 3.5
    expect(computeExpectedTier(4, 4, 4, 4)).toBe("High"); // avg 4.0
  });

  it("returns Critical for average > 4.0", () => {
    expect(computeExpectedTier(5, 5, 4, 4)).toBe("Critical"); // avg 4.5
    expect(computeExpectedTier(5, 5, 5, 5)).toBe("Critical"); // avg 5.0
  });

  it("overrides to High when any dimension is 5 and average < 3.1", () => {
    // avg = (5+1+1+1)/4 = 2.0 → would be Low, but override → High
    expect(computeExpectedTier(5, 1, 1, 1)).toBe("High");

    // avg = (5+2+2+2)/4 = 2.75 → would be Moderate, but override → High
    expect(computeExpectedTier(5, 2, 2, 2)).toBe("High");
  });

  it("does not downgrade High/Critical even with a 5", () => {
    // avg = (5+3+4+4)/4 = 4.0 → High, and has 5 → stays High
    expect(computeExpectedTier(5, 3, 4, 4)).toBe("High");

    // avg = (5+5+4+4)/4 = 4.5 → Critical, stays Critical
    expect(computeExpectedTier(5, 5, 4, 4)).toBe("Critical");
  });
});

// ---------------------------------------------------------------------------
// validateProfile — valid input
// ---------------------------------------------------------------------------

describe("validateProfile", () => {
  it("accepts a fully valid profile", () => {
    const result = validateProfile(validChatGPTProfile());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.profile.tool_profile.tool_name).toBe("ChatGPT");
    }
  });

  // -----------------------------------------------------------------------
  // Structural validation errors
  // -----------------------------------------------------------------------

  it("rejects non-object input", () => {
    const result = validateProfile("not json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects null input", () => {
    const result = validateProfile(null);
    expect(result.valid).toBe(false);
  });

  it("rejects missing top-level keys", () => {
    const result = validateProfile({ tool_profile: {} });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid score range", () => {
    const profile = validChatGPTProfile();
    profile.default_risk_assessment.data_sensitivity_default.score = 7;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Business-rule: overall tier mismatch
  // -----------------------------------------------------------------------

  it("rejects when overall_default_tier does not match rubric", () => {
    const profile = validChatGPTProfile();
    // scores: 5,3,3,4 → avg 3.75 → High (also override for 5)
    // set it to Low to trigger mismatch
    profile.default_risk_assessment.overall_default_tier = "Low";
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("overall_default_tier"))).toBe(
        true,
      );
    }
  });

  // -----------------------------------------------------------------------
  // Business-rule: duplicate enrichment question IDs
  // -----------------------------------------------------------------------

  it("rejects duplicate enrichment question IDs", () => {
    const profile = validChatGPTProfile();
    profile.enrichment_questions[1].question_id = "eq_01"; // duplicate
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("unique"))).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Edge: tier_upgrade_note can be null
  // -----------------------------------------------------------------------

  it("accepts null tier_upgrade_note", () => {
    const profile = { ...validChatGPTProfile(), tier_upgrade_note: null };
    const result = validateProfile(profile);
    expect(result.valid).toBe(true);
  });
});
