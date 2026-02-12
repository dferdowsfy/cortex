/**
 * Tests for Prompt 4 prompt templates
 */

import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "../recommendationPrompts.js";
import { chatGPTRecommendationRequest } from "./recommendationFixtures.js";

describe("RECOMMENDATION_SYSTEM_PROMPT", () => {
  it("includes core principles section", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("CORE PRINCIPLES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("ACTIONABLE, NOT ADVISORY");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("EFFORT-AWARE SIZING");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("GROUPED BY STRATEGY");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("PRIORITIZED BY IMPACT-TO-EFFORT");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("NO FRAMEWORK REFERENCES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("REALISTIC FOR MID-MARKET");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("STRUCTURED OUTPUT");
  });

  it("includes effort level definitions", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("EFFORT LEVELS");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Quick Win"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Low Effort"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Medium Effort"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"High Effort"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Strategic Initiative"');
  });

  it("includes timeframe definitions", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("TIMEFRAME CATEGORIES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Immediate"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Short-term"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Medium-term"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Long-term"');
  });

  it("includes recommendation type definitions", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RECOMMENDATION TYPES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Restrict"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Upgrade"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Policy"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Process"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Communicate"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Monitor"');
  });

  it("includes all rule sets", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE SET 1: CRITICAL FLAG RESPONSE");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE SET 2: ACCESS AND VISIBILITY");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE SET 3: OUTPUT QUALITY AND REVIEW");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE SET 4: GOVERNANCE ESTABLISHMENT");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE SET 5: VENDOR AND CONTRACT");
  });

  it("includes specific generation rules", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE CR-1: Critical Data Exposure");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE CR-2: Critical Regulatory Exposure");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE CR-3: Critical Automated Decisions");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE AV-1: No SSO / No Centralized Access");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE AV-2: No Audit Logging");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE OQ-1: Client-Facing Without Consistent Review");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE OQ-2: No Review Process At All");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE OQ-3: AI Code Without Review");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE GE-1: Shadow AI or Unmanaged Tool");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE GE-2: No Acceptable Use Policy");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE GE-3: No Periodic Review");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE VC-1: Enterprise Upgrade Available");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE VC-2: Client Contract Review");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("RULE VC-3: Vendor Security Documentation Request");
  });

  it("includes strategy consolidation guidance", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("STRATEGY CONSOLIDATION");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("IDENTIFY OVERLAPPING RECOMMENDATIONS");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("GROUP INTO STRATEGIES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("PRIORITIZE STRATEGIES");
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain("CALCULATE IMPACT SUMMARY");
  });

  it("includes common strategy patterns", () => {
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Immediate Risk Reduction"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Tier Migration"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Governance Foundation"');
    expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('"Ongoing Oversight"');
  });
});

describe("buildRecommendationUserPrompt", () => {
  it("includes all three inputs", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    expect(userPrompt).toContain("TOOL PROFILE (from Prompt 1):");
    expect(userPrompt).toContain("RISK CLASSIFICATION (from Prompt 2):");
    expect(userPrompt).toContain("FLAG REPORT (from Prompt 3):");
  });

  it("includes tool profile data", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    expect(userPrompt).toContain("ChatGPT");
    expect(userPrompt).toContain('"tool_name"');
  });

  it("includes risk classification data", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    expect(userPrompt).toContain('"overall_risk"');
    expect(userPrompt).toContain('"data_sensitivity"');
  });

  it("includes flag report data", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    expect(userPrompt).toContain('"flags"');
    expect(userPrompt).toContain('"flag_summary"');
  });

  it("includes instruction to match schema", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    expect(userPrompt).toContain("Generate a prioritized remediation plan");
    expect(userPrompt).toContain("Complyze Recommendation Engine output schema");
  });

  it("formats JSON correctly", () => {
    const request = chatGPTRecommendationRequest();
    const userPrompt = buildRecommendationUserPrompt(request);

    // Should be valid JSON when extracted
    const toolProfileMatch = userPrompt.match(/TOOL PROFILE \(from Prompt 1\):\n([\s\S]+?)\n\nRISK CLASSIFICATION/);
    expect(toolProfileMatch).toBeTruthy();
    
    const extracted = toolProfileMatch![1];
    expect(() => JSON.parse(extracted)).not.toThrow();
  });
});
