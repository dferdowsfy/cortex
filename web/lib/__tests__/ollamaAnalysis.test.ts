import { describe, it, expect } from "vitest";
import { normaliseAndValidate } from "../ollamaAnalysis";

const baseObj = {
    analysis_version: "1.0",
    prompt_summary: "test",
    redacted_prompt: "test",
    overall_risk_score: 0,
    severity: "low",
    confidence: 0,
    sensitive_categories: [],
    contextual_risks: [],
    findings: [],
    suggested_action: "allow",
    dashboard_metrics: {},
    graph_data: {},
    attachment_analysis: {}
};

describe("ollamaAnalysis normalisation", () => {
    it("normalises and clamps confidence correctly", () => {
        const raw = {
            ...baseObj,
            overall_risk_score: 90,
            severity: "Unknown",
            confidence: 85, // Integer (85%)
            suggested_action: "BLOCK", // Enum cleanup test
            sensitive_categories: [" PII_BASIC ", "INVALID_CAT"],
            contextual_risks: ["Data_Exfiltration  "],
            findings: [
                {
                    category: "secret",
                    severity: " CRITICAL ",
                    confidence: 120, // Over 100 should clamp
                    evidence: "AKIAIOSFODNN7EXAMPLE",
                }
            ]
        };

        const result = normaliseAndValidate(raw, "Here is an AWS key: AKIAIOSFODNN7EXAMPLE");

        // Confidence 85 -> 0.85
        expect(result.confidence).toBe(0.85);

        // Finding confidence 120 -> 1.0 (clamped)
        expect(result.findings[0].confidence).toBe(1.0);
    });

    it("recomputes severity based on overall_risk_score", () => {
        const raw = {
            ...baseObj,
            overall_risk_score: 42,
            severity: "critical", // Wrong severity from model
        };

        const result = normaliseAndValidate(raw, "Test");

        // 42 falls into 21-45 which is "medium"
        expect(result.severity).toBe("medium");
        expect(result.graph_data.severity_band).toBe("medium");
    });

    it("falls back to redacted_prompt generated from original prompt", () => {
        const raw = {
            ...baseObj,
            overall_risk_score: 80,
            redacted_prompt: "   ", // Blank/whitespace
            severity: "high",
        };

        const result = normaliseAndValidate(raw, "My SSN is 123-45-6789 and AWS key is AKIA1234567890123456");

        // Should fall back to regex generation
        expect(result.redacted_prompt).toBe("My SSN is [REDACTED_SSN] and AWS key is [REDACTED_AWS_KEY]");
    });

    it("normalises enums and strips whitespace", () => {
        const raw = {
            ...baseObj,
            overall_risk_score: 10,
            suggested_action: "   wARn   ",
            sensitive_categories: ["   SecreTS  ", "pii_basic"],
        };

        const result = normaliseAndValidate(raw, "Test");

        expect(result.suggested_action).toBe("warn");
        expect(result.sensitive_categories).toEqual(["secrets", "pii_basic"]);
    });
});
