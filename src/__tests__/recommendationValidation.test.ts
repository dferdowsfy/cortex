/**
 * Tests for Prompt 4 business rule validation
 */

import { describe, it, expect } from "vitest";
import { validateRecommendationPlan } from "../recommendationValidation.js";
import {
  validChatGPTRecommendations,
  validChatGPTRemediation,
  buildRecommendation,
  buildStrategy,
  buildRemediationPlan,
} from "./recommendationFixtures.js";
import type { RecommendationResponse } from "../recommendationSchema.js";

/**
 * Stub for validChatGPTFlags - minimal mock until Prompt 3 is implemented
 */
function validChatGPTFlags() {
  return {
    flags: [
      { flag_id: "flag_01", title: "Test Flag 1", severity: "Critical", category: "data_exposure", description: "Test", trigger_rule: "DE-1", risk_summary: "Test" },
      { flag_id: "flag_02", title: "Test Flag 2", severity: "High", category: "access_control", description: "Test", trigger_rule: "AC-1", risk_summary: "Test" },
      { flag_id: "flag_03", title: "Test Flag 3", severity: "High", category: "access_control", description: "Test", trigger_rule: "AC-2", risk_summary: "Test" },
      { flag_id: "flag_04", title: "Test Flag 4", severity: "High", category: "output_risk", description: "Test", trigger_rule: "OR-1", risk_summary: "Test" },
      { flag_id: "flag_05", title: "Test Flag 5", severity: "Medium", category: "governance_gap", description: "Test", trigger_rule: "GG-2", risk_summary: "Test" },
      { flag_id: "flag_06", title: "Test Flag 6", severity: "Medium", category: "regulatory_exposure", description: "Test", trigger_rule: "RE-1", risk_summary: "Test" },
    ],
    flag_summary: { critical: 1, high: 3, medium: 2, low: 0, total: 6 },
    executive_summary: "Test flags",
  };
}

describe("validateRecommendationPlan - Valid Plan", () => {
  it("passes valid ChatGPT recommendations", () => {
    const response = validChatGPTRecommendations();
    const flagReport = validChatGPTFlags();
    const result = validateRecommendationPlan(response, flagReport);

    if (!result.valid) {
      console.log("Validation errors:", result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validateRecommendationPlan - Rule 3: Unique rec_id", () => {
  it("detects duplicate recommendation IDs", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({ rec_id: "rec_01" }),
              buildRecommendation({ rec_id: "rec_01" }), // duplicate
            ],
          }),
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate recommendation ID"))).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 4: Unique strategy_id", () => {
  it("detects duplicate strategy IDs", () => {
    const rec1 = buildRecommendation({ rec_id: "rec_01" });
    const rec2 = buildRecommendation({ rec_id: "rec_02" });

    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({ strategy_id: "strat_01", recommendations: [rec1] }),
          buildStrategy({ strategy_id: "strat_01", recommendations: [rec2] }), // duplicate
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 2,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_02"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate strategy ID"))).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 5: Valid flag_id references", () => {
  it("detects invalid flag_id in strategy flags_resolved", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            flags_resolved: [
              {
                flag_id: "flag_invalid",
                flag_title: "Invalid Flag",
                resolution_type: "Fully Resolved",
              },
            ],
            recommendations: [buildRecommendation({ rec_id: "rec_01" })],
          }),
        ],
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("references invalid flag_id"))
    ).toBe(true);
  });

  it("detects invalid flag_id in recommendation flags_addressed", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({
                rec_id: "rec_01",
                flags_addressed: ["flag_invalid"],
              }),
            ],
          }),
        ],
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("references invalid flag_id"))
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 6: Valid dependency references", () => {
  it("detects invalid dependency rec_id", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({
                rec_id: "rec_01",
                dependencies: ["rec_invalid"],
              }),
            ],
          }),
        ],
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("has invalid dependency"))
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 7: No circular dependencies", () => {
  it("detects circular dependencies", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({
                rec_id: "rec_01",
                dependencies: ["rec_02"],
              }),
              buildRecommendation({
                rec_id: "rec_02",
                dependencies: ["rec_01"], // circular
              }),
            ],
          }),
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_02"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Circular dependency detected"))
    ).toBe(true);
  });

  it("detects complex circular dependencies", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({
                rec_id: "rec_01",
                dependencies: ["rec_02"],
              }),
              buildRecommendation({
                rec_id: "rec_02",
                dependencies: ["rec_03"],
              }),
              buildRecommendation({
                rec_id: "rec_03",
                dependencies: ["rec_01"], // circular
              }),
            ],
          }),
        ],
        plan_summary: {
          total_recommendations: 3,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_02", "rec_03"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Circular dependency detected"))
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 8: Implementation phases coverage", () => {
  it("detects recommendation appearing in multiple phases", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [buildRecommendation({ rec_id: "rec_01" })],
          }),
        ],
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"],
              milestone: "Test",
            },
            {
              phase_number: 2,
              phase_name: "Phase 2",
              recommendations: ["rec_01"], // duplicate
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("appears in multiple implementation phases")
      )
    ).toBe(true);
  });

  it("detects recommendation not in any phase", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [
              buildRecommendation({ rec_id: "rec_01" }),
              buildRecommendation({ rec_id: "rec_02" }),
            ],
          }),
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01"], // rec_02 missing
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("not included in any implementation phase")
      )
    ).toBe(true);
  });

  it("detects phase referencing non-existent recommendation", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            recommendations: [buildRecommendation({ rec_id: "rec_01" })],
          }),
        ],
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_invalid"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("references non-existent recommendation")
      )
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 9: Summary counts match", () => {
  it("detects total_recommendations mismatch", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        plan_summary: {
          total_recommendations: 99, // wrong
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("total_recommendations"))
    ).toBe(true);
  });

  it("detects total_strategies mismatch", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 99, // wrong
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("total_strategies"))).toBe(
      true
    );
  });

  it("detects flags_total mismatch", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 99, // wrong
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("flags_total"))).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 10: Quick wins count", () => {
  it("detects quick_wins_available mismatch", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            recommendations: [
              buildRecommendation({ rec_id: "rec_01", effort: "Quick Win" }),
              buildRecommendation({ rec_id: "rec_02", effort: "Low Effort" }),
            ],
          }),
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 99, // wrong (should be 1)
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_02"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("quick_wins_available"))
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 11: Risk tier consistency", () => {
  it("detects quick wins tier higher than current", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        current_risk_tier: "Moderate",
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_quick_wins: "High", // worse than current
          projected_risk_tier_after_full_remediation: "Low",
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("after quick wins") && e.includes("higher than current")
      )
    ).toBe(true);
  });

  it("detects full remediation tier higher than current", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        current_risk_tier: "Moderate",
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_quick_wins: "Moderate",
          projected_risk_tier_after_full_remediation: "High", // worse than current
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("after full remediation") && e.includes("higher than current")
      )
    ).toBe(true);
  });

  it("detects full remediation tier higher than quick wins", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        current_risk_tier: "High",
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_quick_wins: "Low",
          projected_risk_tier_after_full_remediation: "Moderate", // worse than quick wins
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("after full remediation") &&
        e.includes("higher than after quick wins")
      )
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Rule 12: All flags addressed", () => {
  it("detects flag not addressed by any recommendation", () => {
    // Create a flag report with 2 flags
    const flagReport = {
      ...validChatGPTFlags(),
      flags: [
        ...validChatGPTFlags().flags,
        {
          flag_id: "flag_unaddressed",
          title: "Unaddressed Flag",
          severity: "High",
          category: "data_exposure",
          description: "This flag is not addressed",
          trigger_rule: "DE-1",
          risk_summary: "Test risk",
        },
      ],
    };

    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 1, // should be 2
          flags_total: flagReport.flags.length,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        strategies: [
          buildStrategy({
            recommendations: [
              buildRecommendation({
                rec_id: "rec_01",
                flags_addressed: ["flag_01"], // only addresses flag_01, not flag_unaddressed
              }),
            ],
          }),
        ],
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, flagReport);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("is not addressed by any recommendation")
      )
    ).toBe(true);
  });

  it("detects flags_addressed count mismatch", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        plan_summary: {
          total_recommendations: 1,
          total_strategies: 1,
          flags_addressed: 99, // wrong
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("flags_addressed") && e.includes("does not match"))
    ).toBe(true);
  });
});

describe("validateRecommendationPlan - Additional: Strategy priority sorting", () => {
  it("detects strategies not sorted by priority", () => {
    const response: RecommendationResponse = {
      remediation_plan: buildRemediationPlan({
        strategies: [
          buildStrategy({
            strategy_id: "strat_01",
            priority: 2,
            recommendations: [buildRecommendation({ rec_id: "rec_01" })],
          }),
          buildStrategy({
            strategy_id: "strat_02",
            priority: 1, // should come first
            recommendations: [buildRecommendation({ rec_id: "rec_02" })],
          }),
        ],
        plan_summary: {
          total_recommendations: 2,
          total_strategies: 2,
          flags_addressed: 1,
          flags_total: 1,
          quick_wins_available: 0,
          projected_risk_tier_after_full_remediation: "Low",
          projected_risk_tier_after_quick_wins: "Moderate",
          executive_summary: "Test",
        },
        implementation_sequence: {
          description: "Test",
          phases: [
            {
              phase_number: 1,
              phase_name: "Phase 1",
              recommendations: ["rec_01", "rec_02"],
              milestone: "Test",
            },
          ],
        },
      }),
      metadata: {
        schema_version: "1.0",
        prompt_version: "recommendation_engine_v1",
        generation_rules_applied: [],
        consolidations_performed: [],
      },
    };

    const result = validateRecommendationPlan(response, validChatGPTFlags());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("not sorted by priority"))
    ).toBe(true);
  });
});
