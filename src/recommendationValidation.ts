/**
 * Complyze Prompt 4: Recommendation Engine
 * Business rule validation for remediation plans
 */

import type {
  RemediationPlan,
  RecommendationResponse,
  ValidationResult,
  RiskTier,
} from "./recommendationSchema.js";

/**
 * Validate a remediation plan against business rules
 * Implements 12 validation requirements from spec
 */
export function validateRecommendationPlan(
  response: RecommendationResponse,
  flagReport: any
): ValidationResult {
  const errors: string[] = [];
  const plan = response.remediation_plan;

  // Rule 3: Every recommendation has unique rec_id
  const recIds = new Set<string>();
  const allRecommendations = plan.strategies.flatMap((s) => s.recommendations);

  for (const rec of allRecommendations) {
    if (recIds.has(rec.rec_id)) {
      errors.push(`Duplicate recommendation ID: ${rec.rec_id}`);
    }
    recIds.add(rec.rec_id);
  }

  // Rule 4: Every strategy has unique strategy_id
  const stratIds = new Set<string>();
  for (const strat of plan.strategies) {
    if (stratIds.has(strat.strategy_id)) {
      errors.push(`Duplicate strategy ID: ${strat.strategy_id}`);
    }
    stratIds.add(strat.strategy_id);
  }

  // Rule 5: flags_addressed references are valid flag_ids from Prompt 3
  const validFlagIds = new Set(flagReport.flags.map((f: any) => f.flag_id));

  for (const strat of plan.strategies) {
    for (const flagRes of strat.flags_resolved) {
      if (!validFlagIds.has(flagRes.flag_id)) {
        errors.push(
          `Strategy ${strat.strategy_id} references invalid flag_id: ${flagRes.flag_id}`
        );
      }
    }

    for (const rec of strat.recommendations) {
      for (const flagId of rec.flags_addressed) {
        if (!validFlagIds.has(flagId)) {
          errors.push(
            `Recommendation ${rec.rec_id} references invalid flag_id: ${flagId}`
          );
        }
      }
    }
  }

  // Rule 6: Dependencies reference valid rec_ids
  for (const rec of allRecommendations) {
    for (const depId of rec.dependencies) {
      if (!recIds.has(depId)) {
        errors.push(
          `Recommendation ${rec.rec_id} has invalid dependency: ${depId}`
        );
      }
    }
  }

  // Rule 7: No circular dependencies
  const circularCheck = detectCircularDependencies(allRecommendations);
  if (circularCheck) {
    errors.push(`Circular dependency detected: ${circularCheck}`);
  }

  // Rule 8: Implementation phases include all rec_ids exactly once
  const phaseRecIds = new Set<string>();
  for (const phase of plan.implementation_sequence.phases) {
    for (const recId of phase.recommendations) {
      if (phaseRecIds.has(recId)) {
        errors.push(
          `Recommendation ${recId} appears in multiple implementation phases`
        );
      }
      if (!recIds.has(recId)) {
        errors.push(
          `Implementation phase references non-existent recommendation: ${recId}`
        );
      }
      phaseRecIds.add(recId);
    }
  }

  // Check that all recommendations are in some phase
  for (const recId of recIds) {
    if (!phaseRecIds.has(recId)) {
      errors.push(
        `Recommendation ${recId} is not included in any implementation phase`
      );
    }
  }

  // Rule 9: Summary counts match actual counts
  if (plan.plan_summary.total_recommendations !== allRecommendations.length) {
    errors.push(
      `Summary total_recommendations (${plan.plan_summary.total_recommendations}) does not match actual count (${allRecommendations.length})`
    );
  }

  if (plan.plan_summary.total_strategies !== plan.strategies.length) {
    errors.push(
      `Summary total_strategies (${plan.plan_summary.total_strategies}) does not match actual count (${plan.strategies.length})`
    );
  }

  if (plan.plan_summary.flags_total !== flagReport.flags.length) {
    errors.push(
      `Summary flags_total (${plan.plan_summary.flags_total}) does not match actual flag count (${flagReport.flags.length})`
    );
  }

  // Rule 10: Quick wins count matches
  const actualQuickWins = allRecommendations.filter(
    (r) => r.effort === "Quick Win"
  ).length;
  if (plan.plan_summary.quick_wins_available !== actualQuickWins) {
    errors.push(
      `Summary quick_wins_available (${plan.plan_summary.quick_wins_available}) does not match actual count (${actualQuickWins})`
    );
  }

  // Rule 11: Projected risk tiers are logically consistent
  const riskTierOrder: RiskTier[] = ["Low", "Moderate", "High", "Critical"];
  const currentTierIndex = riskTierOrder.indexOf(plan.current_risk_tier);
  const quickWinTierIndex = riskTierOrder.indexOf(
    plan.plan_summary.projected_risk_tier_after_quick_wins
  );
  const fullTierIndex = riskTierOrder.indexOf(
    plan.plan_summary.projected_risk_tier_after_full_remediation
  );

  if (quickWinTierIndex > currentTierIndex) {
    errors.push(
      `Projected risk tier after quick wins (${plan.plan_summary.projected_risk_tier_after_quick_wins}) is higher than current tier (${plan.current_risk_tier})`
    );
  }

  if (fullTierIndex > currentTierIndex) {
    errors.push(
      `Projected risk tier after full remediation (${plan.plan_summary.projected_risk_tier_after_full_remediation}) is higher than current tier (${plan.current_risk_tier})`
    );
  }

  if (fullTierIndex > quickWinTierIndex) {
    errors.push(
      `Projected risk tier after full remediation (${plan.plan_summary.projected_risk_tier_after_full_remediation}) is higher than after quick wins (${plan.plan_summary.projected_risk_tier_after_quick_wins})`
    );
  }

  // Rule 12: Every flag addressed by at least one recommendation
  const addressedFlags = new Set<string>();
  for (const rec of allRecommendations) {
    for (const flagId of rec.flags_addressed) {
      addressedFlags.add(flagId);
    }
  }

  const flagsAddressedCount = addressedFlags.size;
  if (flagsAddressedCount !== plan.plan_summary.flags_addressed) {
    errors.push(
      `Summary flags_addressed (${plan.plan_summary.flags_addressed}) does not match actual unique flags addressed (${flagsAddressedCount})`
    );
  }

  for (const flag of flagReport.flags) {
    if (!addressedFlags.has(flag.flag_id)) {
      errors.push(
        `Flag ${flag.flag_id} ("${flag.title}") is not addressed by any recommendation`
      );
    }
  }

  // Additional validation: Strategies should be sorted by priority
  for (let i = 1; i < plan.strategies.length; i++) {
    if (plan.strategies[i].priority <= plan.strategies[i - 1].priority) {
      errors.push(
        `Strategies not sorted by priority: ${plan.strategies[i - 1].strategy_id} (priority ${plan.strategies[i - 1].priority}) should come before ${plan.strategies[i].strategy_id} (priority ${plan.strategies[i].priority})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect circular dependencies in recommendations
 * Returns description of cycle if found, null otherwise
 */
function detectCircularDependencies(
  recommendations: Array<{ rec_id: string; dependencies: string[] }>
): string | null {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const recMap = new Map(recommendations.map((r) => [r.rec_id, r]));

  function hasCycle(recId: string, path: string[]): string | null {
    if (recStack.has(recId)) {
      const cycleStart = path.indexOf(recId);
      const cycle = [...path.slice(cycleStart), recId].join(" → ");
      return cycle;
    }

    if (visited.has(recId)) {
      return null;
    }

    visited.add(recId);
    recStack.add(recId);

    const rec = recMap.get(recId);
    if (rec) {
      for (const depId of rec.dependencies) {
        const cycle = hasCycle(depId, [...path, recId]);
        if (cycle) return cycle;
      }
    }

    recStack.delete(recId);
    return null;
  }

  for (const rec of recommendations) {
    const cycle = hasCycle(rec.rec_id, []);
    if (cycle) {
      return cycle;
    }
  }

  return null;
}
