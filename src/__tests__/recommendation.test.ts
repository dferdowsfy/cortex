/**
 * Tests for Prompt 4 service layer
 */

import { describe, it, expect } from "vitest";
import { generateRecommendations } from "../recommendation.js";
import {
  chatGPTRecommendationRequest,
  validChatGPTRecommendations,
} from "./recommendationFixtures.js";
import type { LLMCaller } from "../recommendation.js";

describe("generateRecommendations - Success Cases", () => {
  it("returns valid recommendations on first attempt", async () => {
    const validResponse = validChatGPTRecommendations();
    const mockCaller: LLMCaller = async () =>
      JSON.stringify(validResponse);

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(validResponse);
    }
  });

  it("passes system and user prompts to caller", async () => {
    let capturedSystem = "";
    let capturedUser = "";

    const mockCaller: LLMCaller = async (system, user) => {
      capturedSystem = system;
      capturedUser = user;
      return JSON.stringify(validChatGPTRecommendations());
    };

    const request = chatGPTRecommendationRequest();
    await generateRecommendations(request, mockCaller, 3);

    expect(capturedSystem).toContain("Complyze Remediation Advisor");
    expect(capturedSystem).toContain("CORE PRINCIPLES");
    expect(capturedUser).toContain("TOOL PROFILE");
    expect(capturedUser).toContain("RISK CLASSIFICATION");
    expect(capturedUser).toContain("FLAG REPORT");
  });
});

describe("generateRecommendations - Retry Logic", () => {
  it("retries on invalid JSON and succeeds on second attempt", async () => {
    let attemptCount = 0;
    const mockCaller: LLMCaller = async () => {
      attemptCount++;
      if (attemptCount === 1) {
        return "{ invalid json";
      }
      return JSON.stringify(validChatGPTRecommendations());
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(attemptCount).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("retries on schema validation failure", async () => {
    let attemptCount = 0;
    const mockCaller: LLMCaller = async () => {
      attemptCount++;
      if (attemptCount === 1) {
        return JSON.stringify({
          remediation_plan: {}, // missing required fields
          metadata: {},
        });
      }
      return JSON.stringify(validChatGPTRecommendations());
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(attemptCount).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("retries on business rule validation failure", async () => {
    let attemptCount = 0;
    const mockCaller: LLMCaller = async () => {
      attemptCount++;
      if (attemptCount === 1) {
        // Return a plan with duplicate rec_ids
        const invalidResponse = {
          ...validChatGPTRecommendations(),
          remediation_plan: {
            ...validChatGPTRecommendations().remediation_plan,
            strategies: [
              {
                ...validChatGPTRecommendations().remediation_plan.strategies[0],
                recommendations: [
                  {
                    ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                    rec_id: "rec_duplicate",
                  },
                  {
                    ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                    rec_id: "rec_duplicate", // duplicate
                  },
                ],
              },
            ],
          },
        };
        return JSON.stringify(invalidResponse);
      }
      return JSON.stringify(validChatGPTRecommendations());
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(attemptCount).toBe(2);
    expect(result.ok).toBe(true);
  });
});

describe("generateRecommendations - Failure Cases", () => {
  it("fails after max retries with invalid JSON", async () => {
    const mockCaller: LLMCaller = async () => "{ invalid json";

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Failed after 3 attempts");
    }
  });

  it("fails after max retries with schema validation errors", async () => {
    const mockCaller: LLMCaller = async () =>
      JSON.stringify({
        remediation_plan: {}, // always invalid
        metadata: {},
      });

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Failed after 3 attempts");
    }
  });

  it("fails after max retries with business rule violations", async () => {
    const mockCaller: LLMCaller = async () => {
      // Always return plan with duplicate rec_ids
      const invalidResponse = {
        ...validChatGPTRecommendations(),
        remediation_plan: {
          ...validChatGPTRecommendations().remediation_plan,
          strategies: [
            {
              ...validChatGPTRecommendations().remediation_plan.strategies[0],
              recommendations: [
                {
                  ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                  rec_id: "rec_dup",
                },
                {
                  ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                  rec_id: "rec_dup",
                },
              ],
            },
          ],
        },
      };
      return JSON.stringify(invalidResponse);
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Failed after 3 attempts");
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    }
  });

  it("returns validation errors on business rule failure", async () => {
    const mockCaller: LLMCaller = async () => {
      const invalidResponse = {
        ...validChatGPTRecommendations(),
        remediation_plan: {
          ...validChatGPTRecommendations().remediation_plan,
          strategies: [
            {
              ...validChatGPTRecommendations().remediation_plan.strategies[0],
              recommendations: [
                {
                  ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                  rec_id: "rec_dup",
                },
                {
                  ...validChatGPTRecommendations().remediation_plan.strategies[0].recommendations[0],
                  rec_id: "rec_dup",
                },
              ],
            },
          ],
        },
      };
      return JSON.stringify(invalidResponse);
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0]).toContain("Duplicate recommendation ID");
    }
  });

  it("fails with invalid request input", async () => {
    const mockCaller: LLMCaller = async () =>
      JSON.stringify(validChatGPTRecommendations());

    const invalidRequest = {
      // missing required fields
    };

    const result = await generateRecommendations(
      invalidRequest as any,
      mockCaller,
      3
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The error message varies depending on which field is accessed first
      expect(result.error).toContain("Failed after");
    }
  });

  it("handles LLM caller exceptions", async () => {
    const mockCaller: LLMCaller = async () => {
      throw new Error("Network error");
    };

    const request = chatGPTRecommendationRequest();
    const result = await generateRecommendations(request, mockCaller, 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Network error");
    }
  });
});

describe("generateRecommendations - Retry Configuration", () => {
  it("respects maxRetries parameter", async () => {
    let attemptCount = 0;
    const mockCaller: LLMCaller = async () => {
      attemptCount++;
      return "{ invalid json";
    };

    const request = chatGPTRecommendationRequest();
    await generateRecommendations(request, mockCaller, 5);

    expect(attemptCount).toBe(5);
  });

  it("uses default maxRetries of 3", async () => {
    let attemptCount = 0;
    const mockCaller: LLMCaller = async () => {
      attemptCount++;
      return "{ invalid json";
    };

    const request = chatGPTRecommendationRequest();
    await generateRecommendations(request, mockCaller); // no maxRetries specified

    expect(attemptCount).toBe(3);
  });
});
