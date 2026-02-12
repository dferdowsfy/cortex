/**
 * Complyze Prompt 2 — Classification Validation Layer
 *
 * Validates raw LLM output against the Risk Classification schema
 * and applies business-rule checks: tier calculation, override rules,
 * dimension average consistency, enrichment coverage math, and
 * score-comparison direction accuracy.
 */
import { ZodError } from "zod";
import {
  RiskClassificationSchema,
  type RiskClassification,
  type GovernanceLevel,
} from "./classificationSchema.js";
import type { OverallTier } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationValidationSuccess {
  valid: true;
  classification: RiskClassification;
}

export interface ClassificationValidationFailure {
  valid: false;
  errors: string[];
}

export type ClassificationValidationResult =
  | ClassificationValidationSuccess
  | ClassificationValidationFailure;

// ---------------------------------------------------------------------------
// Business Rules
// ---------------------------------------------------------------------------

/**
 * Compute the expected overall tier from the four dimension scores,
 * including the Prompt 2 override rules:
 *   1. Any dimension = 5 → minimum High
 *   2. data_sensitivity = 5 AND human_oversight >= 4 → Critical
 *   3. governance = "Shadow AI" → minimum High
 */
export function computeClassificationTier(
  dataSensitivity: number,
  decisionImpact: number,
  affectedParties: number,
  humanOversight: number,
  governanceLevel: GovernanceLevel,
): { tier: OverallTier; tierFromAverage: OverallTier; average: number } {
  const avg =
    (dataSensitivity + decisionImpact + affectedParties + humanOversight) / 4;
  const roundedAvg = Math.round(avg * 10) / 10;

  // Tier from average alone
  let tierFromAverage: OverallTier;
  if (avg <= 2.0) {
    tierFromAverage = "Low";
  } else if (avg <= 3.0) {
    tierFromAverage = "Moderate";
  } else if (avg <= 4.0) {
    tierFromAverage = "High";
  } else {
    tierFromAverage = "Critical";
  }

  let tier = tierFromAverage;

  // Override 1: any dimension = 5 → minimum High
  const hasMax =
    dataSensitivity === 5 ||
    decisionImpact === 5 ||
    affectedParties === 5 ||
    humanOversight === 5;

  if (hasMax && (tier === "Low" || tier === "Moderate")) {
    tier = "High";
  }

  // Override 2: data_sensitivity = 5 AND human_oversight >= 4 → Critical
  if (dataSensitivity === 5 && humanOversight >= 4) {
    tier = "Critical";
  }

  // Override 3: governance = "Shadow AI" → minimum High
  if (governanceLevel === "Shadow AI" && (tier === "Low" || tier === "Moderate")) {
    tier = "High";
  }

  return { tier, tierFromAverage, average: roundedAvg };
}

/**
 * Determine the expected direction string for a score change.
 */
export function expectedDirection(
  defaultScore: number,
  finalScore: number,
): "increased" | "decreased" | "unchanged" {
  if (finalScore > defaultScore) return "increased";
  if (finalScore < defaultScore) return "decreased";
  return "unchanged";
}

// ---------------------------------------------------------------------------
// Main Validator
// ---------------------------------------------------------------------------

export function validateClassification(
  raw: unknown,
): ClassificationValidationResult {
  const errors: string[] = [];

  // 1. Structural validation via Zod ----------------------------------------
  let classification: RiskClassification;
  try {
    classification = RiskClassificationSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      errors.push(`Unexpected validation error: ${String(err)}`);
    }
    return { valid: false, errors };
  }

  const c = classification.classification;
  const dims = c.dimensions;

  // 2. Dimension scores are integers 1-5 (already enforced by Zod, but
  //    verify final score = capped(base + modifiers))
  for (const [name, dim] of Object.entries(dims) as [string, typeof dims.data_sensitivity][]) {
    const expectedScore = Math.min(
      5,
      Math.max(
        1,
        dim.base_score +
          dim.modifiers_applied.reduce((sum, m) => sum + m.adjustment, 0),
      ),
    );
    if (dim.score !== expectedScore) {
      errors.push(
        `${name}: final score ${dim.score} does not match base_score (${dim.base_score}) + modifiers (${dim.modifiers_applied.map((m) => m.adjustment).join(", ") || "none"}) = expected ${expectedScore}`,
      );
    }
  }

  // 3. Dimension average matches stated value --------------------------------
  const computedAvg =
    (dims.data_sensitivity.score +
      dims.decision_impact.score +
      dims.affected_parties.score +
      dims.human_oversight.score) /
    4;
  const roundedComputedAvg = Math.round(computedAvg * 10) / 10;

  if (
    Math.abs(c.overall_risk.dimension_average - roundedComputedAvg) > 0.05
  ) {
    errors.push(
      `dimension_average is ${c.overall_risk.dimension_average} but computed average is ${roundedComputedAvg}`,
    );
  }

  // 4. Tier consistency with rubric + overrides ------------------------------
  const {
    tier: expectedTier,
    tierFromAverage: expectedTierFromAvg,
  } = computeClassificationTier(
    dims.data_sensitivity.score,
    dims.decision_impact.score,
    dims.affected_parties.score,
    dims.human_oversight.score,
    c.governance_status.level,
  );

  if (c.overall_risk.tier_from_average !== expectedTierFromAvg) {
    errors.push(
      `tier_from_average is "${c.overall_risk.tier_from_average}" but average ${roundedComputedAvg} maps to "${expectedTierFromAvg}"`,
    );
  }

  // We allow the LLM to produce a tier >= expectedTier (more conservative is OK)
  const tierOrder: Record<string, number> = {
    Low: 0,
    Moderate: 1,
    High: 2,
    Critical: 3,
  };
  if (tierOrder[c.overall_risk.tier] < tierOrder[expectedTier]) {
    errors.push(
      `overall tier "${c.overall_risk.tier}" is below the minimum required "${expectedTier}" per rubric overrides`,
    );
  }

  // 5. Every dimension justification is non-empty (Zod min(10) covers this)

  // 6. score_comparison_to_defaults directions are correct -------------------
  const comparisons = c.score_comparison_to_defaults;
  const dimNames = [
    "data_sensitivity",
    "decision_impact",
    "affected_parties",
    "human_oversight",
  ] as const;
  const changeKeys = [
    "data_sensitivity_change",
    "decision_impact_change",
    "affected_parties_change",
    "human_oversight_change",
  ] as const;

  for (let i = 0; i < dimNames.length; i++) {
    const change = comparisons[changeKeys[i]];
    const expected = expectedDirection(change.default_score, change.final_score);
    if (change.direction !== expected) {
      errors.push(
        `${changeKeys[i]}.direction is "${change.direction}" but default=${change.default_score} → final=${change.final_score} implies "${expected}"`,
      );
    }

    // final_score in comparison should match dimension score
    if (change.final_score !== dims[dimNames[i]].score) {
      errors.push(
        `${changeKeys[i]}.final_score (${change.final_score}) does not match dimension score (${dims[dimNames[i]].score})`,
      );
    }
  }

  // 7. Enrichment coverage counts are consistent ----------------------------
  const cov = c.enrichment_coverage;
  if (cov.questions_answered + cov.questions_unanswered !== cov.questions_total) {
    errors.push(
      `Enrichment coverage: answered (${cov.questions_answered}) + unanswered (${cov.questions_unanswered}) != total (${cov.questions_total})`,
    );
  }

  // 8. Assessment confidence consistency ------------------------------------
  if (cov.questions_total > 0) {
    const ratio = cov.questions_answered / cov.questions_total;
    if (ratio >= 1 && cov.assessment_confidence !== "High") {
      errors.push(
        `All questions answered but assessment_confidence is "${cov.assessment_confidence}" instead of "High"`,
      );
    }
    if (ratio < 0.5 && cov.assessment_confidence === "High") {
      errors.push(
        `Less than half of questions answered but assessment_confidence is "High"`,
      );
    }
  }

  // 9. Reassessment consistency ---------------------------------------------
  const reass = classification.reassessment_comparison;
  if (c.assessment_type === "reassessment" && !reass.is_reassessment) {
    errors.push(
      `assessment_type is "reassessment" but reassessment_comparison.is_reassessment is false`,
    );
  }
  if (c.assessment_type === "initial" && reass.is_reassessment) {
    errors.push(
      `assessment_type is "initial" but reassessment_comparison.is_reassessment is true`,
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, classification };
}
