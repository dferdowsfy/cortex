/**
 * Complyze Prompt 1 — Validation Layer
 *
 * Validates raw LLM output against the Tool Intelligence Profile schema
 * and applies business-rule checks that go beyond structural validation
 * (e.g., the overall-tier override rule).
 */
import { ZodError } from "zod";
import {
  ToolIntelligenceProfileSchema,
  type ToolIntelligenceProfile,
  type OverallTier,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationSuccess {
  valid: true;
  profile: ToolIntelligenceProfile;
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ---------------------------------------------------------------------------
// Business Rules
// ---------------------------------------------------------------------------

/**
 * Compute the expected overall tier from the four dimension scores,
 * including the "any dimension = 5 → at least High" override.
 */
export function computeExpectedTier(
  dataSensitivity: number,
  decisionImpact: number,
  affectedParties: number,
  humanOversight: number,
): OverallTier {
  const avg =
    (dataSensitivity + decisionImpact + affectedParties + humanOversight) / 4;

  const hasMax =
    dataSensitivity === 5 ||
    decisionImpact === 5 ||
    affectedParties === 5 ||
    humanOversight === 5;

  let tier: OverallTier;
  if (avg <= 2.0) {
    tier = "Low";
  } else if (avg <= 3.0) {
    tier = "Moderate";
  } else if (avg <= 4.0) {
    tier = "High";
  } else {
    tier = "Critical";
  }

  // Override: any dimension at 5 forces at least High.
  if (hasMax && (tier === "Low" || tier === "Moderate")) {
    tier = "High";
  }

  return tier;
}

// ---------------------------------------------------------------------------
// Main Validator
// ---------------------------------------------------------------------------

/**
 * Validate a raw parsed JSON value (from the LLM response) against the
 * full schema plus business rules. Returns a discriminated union so
 * callers can branch cleanly.
 */
export function validateProfile(raw: unknown): ValidationResult {
  const errors: string[] = [];

  // 1. Structural / type validation via Zod --------------------------------
  let profile: ToolIntelligenceProfile;
  try {
    profile = ToolIntelligenceProfileSchema.parse(raw);
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

  // 2. Business-rule checks -------------------------------------------------

  // 2a. Overall tier must match the rubric
  const risk = profile.default_risk_assessment;
  const expectedTier = computeExpectedTier(
    risk.data_sensitivity_default.score,
    risk.decision_impact_default.score,
    risk.affected_parties_default.score,
    risk.human_oversight_default.score,
  );
  if (risk.overall_default_tier !== expectedTier) {
    errors.push(
      `overall_default_tier is "${risk.overall_default_tier}" but rubric expects "${expectedTier}" ` +
        `(scores: ${risk.data_sensitivity_default.score}, ${risk.decision_impact_default.score}, ` +
        `${risk.affected_parties_default.score}, ${risk.human_oversight_default.score})`,
    );
  }

  // 2b. Minimum enrichment questions
  if (profile.enrichment_questions.length < 3) {
    errors.push(
      `Expected at least 3 enrichment questions, got ${profile.enrichment_questions.length}`,
    );
  }

  // 2c. Minimum risk flags
  if (profile.known_risk_flags.length < 1) {
    errors.push(
      `Expected at least 1 risk flag, got ${profile.known_risk_flags.length}`,
    );
  }

  // 2d. Unique enrichment question IDs
  const qIds = profile.enrichment_questions.map((q) => q.question_id);
  const uniqueQIds = new Set(qIds);
  if (uniqueQIds.size !== qIds.length) {
    errors.push("Enrichment question IDs are not unique");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, profile };
}
