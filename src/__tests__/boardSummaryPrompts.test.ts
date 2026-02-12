/**
 * Complyze Prompt 5: Board Summary Prompt Tests
 */

import { describe, it, expect } from "vitest";
import {
  BOARD_SUMMARY_SYSTEM_PROMPT,
  buildBoardSummaryUserPrompt,
} from "../boardSummaryPrompts.js";
import {
  meridianBoardSummaryRequest,
  singleToolRequest,
  meridianFollowUpOrganization,
} from "./boardSummaryFixtures.js";
import type { BoardSummaryRequest } from "../boardSummarySchema.js";

// ── System Prompt ──────────────────────────────────────────────────

describe("BOARD_SUMMARY_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof BOARD_SUMMARY_SYSTEM_PROMPT).toBe("string");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("establishes executive narrator identity", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "Complyze Executive Narrator"
    );
  });

  it("defines 7 core principles", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("EXECUTIVE VOICE");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("NARRATIVE OVER DATA DUMP");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "APPROPRIATE ALARM CALIBRATION"
    );
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("ACTIONABLE FOR LEADERSHIP");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("NO FRAMEWORK JARGON");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("HONEST ABOUT COVERAGE");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("STRUCTURED OUTPUT");
  });

  it("includes all 7 narrative sections", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 1: EXECUTIVE OVERVIEW");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 2: AI PORTFOLIO OVERVIEW");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 3: RISK POSTURE ANALYSIS");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 4: CRITICAL AND HIGH FINDINGS");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 5: REMEDIATION PROGRESS");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 6: LEADERSHIP ACTION ITEMS");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SECTION 7: OUTLOOK AND NEXT STEPS");
  });

  it("includes change reporting guidance", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("CHANGE REPORTING");
  });

  it("includes tone calibration guidance", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("TONE CALIBRATION");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("ALL LOW RISK, ALL MANAGED");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("ALL CRITICAL OR HIGH");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("SINGLE TOOL ASSESSED");
  });

  it("references posture assessment calibrations", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("well-managed");
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "acceptable with areas requiring attention"
    );
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "elevated and requires immediate leadership attention"
    );
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "limited visibility"
    );
  });

  it("prohibits framework jargon explicitly", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "Never reference NIST, ISO, EU AI Act"
    );
  });

  it("specifies valid JSON output", () => {
    expect(BOARD_SUMMARY_SYSTEM_PROMPT).toContain("valid JSON");
  });
});

// ── User Prompt ────────────────────────────────────────────────────

describe("buildBoardSummaryUserPrompt", () => {
  it("includes organization context fields", () => {
    const prompt = buildBoardSummaryUserPrompt(meridianBoardSummaryRequest());
    expect(prompt).toContain("Meridian Financial Advisors");
    expect(prompt).toContain("Financial Services");
    expect(prompt).toContain("800");
    expect(prompt).toContain("Q1 2026");
    expect(prompt).toContain("Quarterly");
  });

  it("indicates null previous report date for first report", () => {
    const prompt = buildBoardSummaryUserPrompt(meridianBoardSummaryRequest());
    expect(prompt).toContain("null (first report)");
  });

  it("includes previous report date when present", () => {
    const req: BoardSummaryRequest = {
      organization: meridianFollowUpOrganization(),
      tool_assessments: meridianBoardSummaryRequest().tool_assessments,
    };
    const prompt = buildBoardSummaryUserPrompt(req);
    expect(prompt).toContain("2026-02-12T00:00:00Z");
    expect(prompt).not.toContain("null (first report)");
  });

  it("serializes tool assessments as JSON", () => {
    const prompt = buildBoardSummaryUserPrompt(meridianBoardSummaryRequest());
    expect(prompt).toContain("tool_profile");
    expect(prompt).toContain("risk_classification");
    expect(prompt).toContain("flag_report");
    expect(prompt).toContain("remediation_plan");
  });

  it("includes all tool names in serialized data", () => {
    const prompt = buildBoardSummaryUserPrompt(meridianBoardSummaryRequest());
    expect(prompt).toContain("ChatGPT");
    expect(prompt).toContain("Microsoft Copilot");
    expect(prompt).toContain("Otter.ai");
  });

  it("works with single-tool request", () => {
    const prompt = buildBoardSummaryUserPrompt(singleToolRequest());
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("Technology");
    expect(prompt).toContain("Ad Hoc");
    expect(prompt).toContain("ChatGPT");
  });

  it("includes prompt instructions", () => {
    const prompt = buildBoardSummaryUserPrompt(meridianBoardSummaryRequest());
    expect(prompt).toContain("board-level AI risk posture summary");
    expect(prompt).toContain("Complyze Board Summary schema");
  });
});
