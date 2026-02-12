/**
 * Complyze Prompt 5: Board Summary Service Tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateBoardSummary,
  createAnthropicCaller,
  generatePortfolioReport,
  type LLMCaller,
} from "../boardSummary.js";
import {
  meridianBoardSummaryRequest,
  singleToolRequest,
  validBoardSummaryResponse,
} from "./boardSummaryFixtures.js";

// ── Mock LLM Caller ───────────────────────────────────────────────

function mockLLMCaller(responseData: any): LLMCaller {
  return vi.fn().mockResolvedValue(JSON.stringify(responseData));
}

function mockLLMCallerRaw(responseText: string): LLMCaller {
  return vi.fn().mockResolvedValue(responseText);
}

function mockLLMCallerError(error: Error): LLMCaller {
  return vi.fn().mockRejectedValue(error);
}

// ── generateBoardSummary ──────────────────────────────────────────

describe("generateBoardSummary", () => {
  it("returns success for valid response", async () => {
    const caller = mockLLMCaller(validBoardSummaryResponse());
    const request = meridianBoardSummaryRequest();

    const result = await generateBoardSummary(request, caller);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.board_summary.report_metadata.company_name).toBe(
        "Meridian Financial Advisors"
      );
      expect(result.data.metadata.schema_version).toBe("1.0");
    }
  });

  it("passes system and user prompts to LLM", async () => {
    const caller = mockLLMCaller(validBoardSummaryResponse());
    const request = meridianBoardSummaryRequest();

    await generateBoardSummary(request, caller);

    expect(caller).toHaveBeenCalledWith(
      expect.stringContaining("Complyze Executive Narrator"),
      expect.stringContaining("Meridian Financial Advisors")
    );
  });

  it("rejects invalid request", async () => {
    const caller = mockLLMCaller({});
    const invalidRequest = { organization: {}, tool_assessments: [] };

    const result = await generateBoardSummary(invalidRequest as any, caller);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid request");
    }
  });

  it("retries on JSON parse failure", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify(validBoardSummaryResponse()));

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller
    );

    expect(result.ok).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("retries on schema validation failure", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ invalid: true }))
      .mockResolvedValueOnce(JSON.stringify(validBoardSummaryResponse()));

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller
    );

    expect(result.ok).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("retries on business rule failure", async () => {
    // Build a response that passes schema but fails business rules
    const badResponse = JSON.parse(
      JSON.stringify(validBoardSummaryResponse())
    );
    badResponse.metadata.tools_included = 99; // Wrong

    const caller = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(badResponse))
      .mockResolvedValueOnce(JSON.stringify(validBoardSummaryResponse()));

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller
    );

    expect(result.ok).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("fails after max retries exhausted", async () => {
    const caller = mockLLMCallerRaw("not json");

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller,
      2
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Failed after 2 attempts");
    }
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("handles LLM error and retries", async () => {
    const caller = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce(JSON.stringify(validBoardSummaryResponse()));

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller
    );

    expect(result.ok).toBe(true);
    expect(caller).toHaveBeenCalledTimes(2);
  });

  it("returns validation errors on final failure", async () => {
    // Response that passes schema but fails business validation
    const badResponse = JSON.parse(
      JSON.stringify(validBoardSummaryResponse())
    );
    badResponse.metadata.tools_included = 99;

    const caller = mockLLMCaller(badResponse);

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller,
      1
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    }
  });

  it("works with single-tool request", async () => {
    // Adjust response for single-tool context
    const singleResponse = JSON.parse(
      JSON.stringify(validBoardSummaryResponse())
    );
    singleResponse.metadata.tools_included = 1;
    // Adjust snapshot to match single tool
    singleResponse.board_summary.portfolio_snapshot.total_tools_registered = 1;
    singleResponse.board_summary.portfolio_snapshot.tools_by_risk_tier = {
      critical: 1,
      high: 0,
      moderate: 0,
      low: 0,
    };
    singleResponse.board_summary.portfolio_snapshot.tools_by_governance_status = {
      managed: 0,
      partially_managed: 1,
      unmanaged: 0,
      shadow_ai: 0,
    };
    singleResponse.board_summary.portfolio_snapshot.total_recommendations = 8;
    singleResponse.board_summary.portfolio_snapshot.recommendations_completed = 3;
    singleResponse.board_summary.portfolio_snapshot.recommendations_in_progress = 2;
    singleResponse.board_summary.portfolio_snapshot.recommendations_not_started = 2;
    singleResponse.board_summary.portfolio_snapshot.recommendations_deferred = 1;
    singleResponse.board_summary.portfolio_snapshot.remediation_completion_percentage = 37.5;
    // Fix chart data to match
    singleResponse.board_summary.appendix_data.risk_distribution_data.values = [1, 0, 0, 0];
    singleResponse.board_summary.appendix_data.governance_distribution_data.values = [0, 1, 0, 0];
    singleResponse.board_summary.appendix_data.remediation_progress_data.values = [3, 2, 2, 1];
    // Fix tool summary table
    singleResponse.board_summary.appendix_data.tool_summary_table = [
      singleResponse.board_summary.appendix_data.tool_summary_table[0],
    ];

    const caller = mockLLMCaller(singleResponse);
    const result = await generateBoardSummary(singleToolRequest(), caller);

    expect(result.ok).toBe(true);
  });

  it("handles non-Error throw", async () => {
    const caller = vi.fn().mockRejectedValue("string error");

    const result = await generateBoardSummary(
      meridianBoardSummaryRequest(),
      caller,
      1
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown error");
    }
  });
});

// ── createAnthropicCaller ──────────────────────────────────────────

describe("createAnthropicCaller", () => {
  it("creates a callable function", () => {
    const caller = createAnthropicCaller("test-key");
    expect(typeof caller).toBe("function");
  });
});

// ── generatePortfolioReport ────────────────────────────────────────

describe("generatePortfolioReport", () => {
  it("is exported and callable", () => {
    expect(typeof generatePortfolioReport).toBe("function");
  });
});
