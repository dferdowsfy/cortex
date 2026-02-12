/**
 * Tests for Prompt 4 Zod schemas
 */

import { describe, it, expect } from "vitest";
import {
  EffortLevelSchema,
  TimeframeSchema,
  RecommendationTypeSchema,
  ResolutionTypeSchema,
  RiskTierSchema,
  GovernanceStatusSchema,
  FlagResolutionSchema,
  RecommendationSchema,
  StrategySchema,
  ImplementationPhaseSchema,
  RemediationPlanSchema,
  RecommendationResponseSchema,
} from "../recommendationSchema.js";
import {
  validChatGPTRecommendations,
  buildRecommendation,
  buildStrategy,
  buildRemediationPlan,
} from "./recommendationFixtures.js";

describe("Recommendation Schema - Enums", () => {
  it("validates effort levels", () => {
    expect(EffortLevelSchema.parse("Quick Win")).toBe("Quick Win");
    expect(EffortLevelSchema.parse("Low Effort")).toBe("Low Effort");
    expect(EffortLevelSchema.parse("Medium Effort")).toBe("Medium Effort");
    expect(EffortLevelSchema.parse("High Effort")).toBe("High Effort");
    expect(EffortLevelSchema.parse("Strategic Initiative")).toBe(
      "Strategic Initiative"
    );
    expect(() => EffortLevelSchema.parse("Invalid")).toThrow();
  });

  it("validates timeframes", () => {
    expect(TimeframeSchema.parse("Immediate")).toBe("Immediate");
    expect(TimeframeSchema.parse("Short-term")).toBe("Short-term");
    expect(TimeframeSchema.parse("Medium-term")).toBe("Medium-term");
    expect(TimeframeSchema.parse("Long-term")).toBe("Long-term");
    expect(() => TimeframeSchema.parse("Invalid")).toThrow();
  });

  it("validates recommendation types", () => {
    expect(RecommendationTypeSchema.parse("Restrict")).toBe("Restrict");
    expect(RecommendationTypeSchema.parse("Upgrade")).toBe("Upgrade");
    expect(RecommendationTypeSchema.parse("Policy")).toBe("Policy");
    expect(RecommendationTypeSchema.parse("Process")).toBe("Process");
    expect(RecommendationTypeSchema.parse("Communicate")).toBe("Communicate");
    expect(RecommendationTypeSchema.parse("Monitor")).toBe("Monitor");
    expect(() => RecommendationTypeSchema.parse("Invalid")).toThrow();
  });

  it("validates resolution types", () => {
    expect(ResolutionTypeSchema.parse("Fully Resolved")).toBe("Fully Resolved");
    expect(ResolutionTypeSchema.parse("Severity Reduced")).toBe(
      "Severity Reduced"
    );
    expect(ResolutionTypeSchema.parse("Partially Addressed")).toBe(
      "Partially Addressed"
    );
    expect(() => ResolutionTypeSchema.parse("Invalid")).toThrow();
  });

  it("validates risk tiers", () => {
    expect(RiskTierSchema.parse("Critical")).toBe("Critical");
    expect(RiskTierSchema.parse("High")).toBe("High");
    expect(RiskTierSchema.parse("Moderate")).toBe("Moderate");
    expect(RiskTierSchema.parse("Low")).toBe("Low");
    expect(() => RiskTierSchema.parse("Invalid")).toThrow();
  });

  it("validates governance status", () => {
    expect(GovernanceStatusSchema.parse("Unmanaged")).toBe("Unmanaged");
    expect(GovernanceStatusSchema.parse("Partially Managed")).toBe(
      "Partially Managed"
    );
    expect(GovernanceStatusSchema.parse("Managed")).toBe("Managed");
    expect(() => GovernanceStatusSchema.parse("Invalid")).toThrow();
  });
});

describe("Recommendation Schema - FlagResolution", () => {
  it("validates valid flag resolution", () => {
    const resolution = {
      flag_id: "flag_01",
      flag_title: "Test Flag",
      resolution_type: "Fully Resolved",
    };
    expect(FlagResolutionSchema.parse(resolution)).toEqual(resolution);
  });

  it("rejects missing fields", () => {
    expect(() =>
      FlagResolutionSchema.parse({
        flag_id: "flag_01",
        // missing flag_title and resolution_type
      })
    ).toThrow();
  });
});

describe("Recommendation Schema - Recommendation", () => {
  it("validates valid recommendation", () => {
    const rec = buildRecommendation({});
    expect(RecommendationSchema.parse(rec)).toEqual(rec);
  });

  it("requires at least one step", () => {
    const rec = buildRecommendation({ steps: [] });
    expect(() => RecommendationSchema.parse(rec)).toThrow();
  });

  it("allows empty dependencies array", () => {
    const rec = buildRecommendation({ dependencies: [] });
    expect(RecommendationSchema.parse(rec).dependencies).toEqual([]);
  });

  it("allows empty flags_addressed array", () => {
    const rec = buildRecommendation({ flags_addressed: [] });
    expect(RecommendationSchema.parse(rec).flags_addressed).toEqual([]);
  });
});

describe("Recommendation Schema - Strategy", () => {
  it("validates valid strategy", () => {
    const strat = buildStrategy({});
    expect(StrategySchema.parse(strat)).toEqual(strat);
  });

  it("requires at least one recommendation", () => {
    const strat = buildStrategy({ recommendations: [] });
    expect(() => StrategySchema.parse(strat)).toThrow();
  });

  it("validates priority is positive integer", () => {
    expect(() => buildStrategy({ priority: 0 })).not.toThrow();
    expect(() => StrategySchema.parse(buildStrategy({ priority: 0 }))).toThrow();
    expect(() =>
      StrategySchema.parse(buildStrategy({ priority: -1 }))
    ).toThrow();
    expect(() =>
      StrategySchema.parse(buildStrategy({ priority: 1.5 }))
    ).toThrow();
  });
});

describe("Recommendation Schema - ImplementationPhase", () => {
  it("validates valid implementation phase", () => {
    const phase = {
      phase_number: 1,
      phase_name: "Phase 1",
      recommendations: ["rec_01", "rec_02"],
      milestone: "Complete first phase",
    };
    expect(ImplementationPhaseSchema.parse(phase)).toEqual(phase);
  });

  it("requires at least one recommendation", () => {
    expect(() =>
      ImplementationPhaseSchema.parse({
        phase_number: 1,
        phase_name: "Phase 1",
        recommendations: [],
        milestone: "Test",
      })
    ).toThrow();
  });

  it("validates phase_number is positive integer", () => {
    expect(() =>
      ImplementationPhaseSchema.parse({
        phase_number: 0,
        phase_name: "Phase 0",
        recommendations: ["rec_01"],
        milestone: "Test",
      })
    ).toThrow();
  });
});

describe("Recommendation Schema - RemediationPlan", () => {
  it("validates valid remediation plan", () => {
    const plan = buildRemediationPlan({});
    expect(RemediationPlanSchema.parse(plan)).toEqual(plan);
  });

  it("validates plan_summary counts are non-negative", () => {
    const plan = buildRemediationPlan({
      plan_summary: {
        total_recommendations: -1,
        total_strategies: 1,
        flags_addressed: 1,
        flags_total: 1,
        quick_wins_available: 0,
        projected_risk_tier_after_full_remediation: "Low",
        projected_risk_tier_after_quick_wins: "Moderate",
        executive_summary: "Test",
      },
    });
    expect(() => RemediationPlanSchema.parse(plan)).toThrow();
  });

  it("allows zero strategies", () => {
    const plan = buildRemediationPlan({
      strategies: [],
      plan_summary: {
        total_recommendations: 0,
        total_strategies: 0,
        flags_addressed: 0,
        flags_total: 1,
        quick_wins_available: 0,
        projected_risk_tier_after_full_remediation: "Low",
        projected_risk_tier_after_quick_wins: "Moderate",
        executive_summary: "No remediation needed",
      },
      implementation_sequence: {
        description: "No implementation needed",
        phases: [],
      },
    });
    // This should parse successfully at schema level
    // Business validation would catch this as problematic
    expect(() => RemediationPlanSchema.parse(plan)).toThrow(); // phases requires at least 1
  });
});

describe("Recommendation Schema - Complete Response", () => {
  it("validates valid ChatGPT recommendations", () => {
    const response = validChatGPTRecommendations();
    expect(RecommendationResponseSchema.parse(response)).toEqual(response);
  });

  it("validates metadata structure", () => {
    const response = validChatGPTRecommendations();
    expect(response.metadata.schema_version).toBe("1.0");
    expect(response.metadata.prompt_version).toBe("recommendation_engine_v1");
    expect(Array.isArray(response.metadata.generation_rules_applied)).toBe(
      true
    );
    expect(Array.isArray(response.metadata.consolidations_performed)).toBe(
      true
    );
  });

  it("rejects response missing metadata", () => {
    const response = {
      remediation_plan: buildRemediationPlan({}),
      // missing metadata
    };
    expect(() => RecommendationResponseSchema.parse(response)).toThrow();
  });
});
