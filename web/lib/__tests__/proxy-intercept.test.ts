/**
 * Tests for Proxy Intercept Logic
 *
 * Validates the end-to-end flow: classification → event creation → policy
 * enforcement for prompts received from AI browsers and desktop apps.
 */
import { describe, it, expect } from "vitest";
import {
    classifyContent,
    hashString,
    extractToolDomain,
    identifyTool,
    estimateTokens,
    redactSensitiveContent,
} from "../proxy-classifier";
import type { ActivityEvent, EnforcementMode } from "../proxy-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_ENFORCEMENT_MODES: EnforcementMode[] = ["monitor", "warn", "redact", "block"];

function resolveEnforcementMode(settings: {
    enforcement_mode?: EnforcementMode;
    block_high_risk?: boolean;
    redact_sensitive?: boolean;
}): EnforcementMode {
    if (settings.enforcement_mode && VALID_ENFORCEMENT_MODES.includes(settings.enforcement_mode)) {
        return settings.enforcement_mode;
    }
    if (settings.block_high_risk) return "block";
    if (settings.redact_sensitive) return "redact";
    return "monitor";
}

function buildActivityEvent(
    targetUrl: string,
    promptBody: string,
    settings: {
        full_audit_mode?: boolean;
        block_high_risk?: boolean;
        enforcement_mode?: EnforcementMode;
        inspect_attachments?: boolean;
    } = {}
): ActivityEvent {
    const domain = extractToolDomain(targetUrl);
    const tool = identifyTool(domain);
    const classification = classifyContent(promptBody);
    const activeMode = resolveEnforcementMode(settings);

    const event: ActivityEvent = {
        id: `evt_test_${Date.now()}`,
        tool,
        tool_domain: domain,
        user_hash: hashString("test-user"),
        prompt_hash: hashString(promptBody),
        prompt_length: promptBody.length,
        token_count_estimate: estimateTokens(promptBody),
        api_endpoint: new URL(targetUrl).pathname,
        sensitivity_score: classification.sensitivity_score,
        sensitivity_categories: classification.categories_detected,
        policy_violation_flag: classification.policy_violation_flag,
        risk_category: classification.risk_category,
        timestamp: new Date().toISOString(),
        attachment_inspection_enabled: settings.inspect_attachments ?? false,
    };

    if (settings.full_audit_mode) {
        event.full_prompt = promptBody;
    }

    // Only block when enforcement mode is explicitly 'block' and risk is critical
    if (activeMode === "block" && classification.risk_category === "critical") {
        event.blocked = true;
    }

    // Record enforcement action
    if (classification.policy_violation_flag || classification.risk_category === "critical") {
        event.enforcement_action = activeMode;
    }

    return event;
}

// ─── Browser AI App Scenarios ─────────────────────────────────────────────────

describe("Intercept: ChatGPT browser (chatgpt.com / api.openai.com)", () => {
    const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

    it("captures clean prompt with no violations", () => {
        const event = buildActivityEvent(OPENAI_URL, "What is the capital of France?");
        expect(event.tool).toBe("ChatGPT / OpenAI");
        expect(event.tool_domain).toBe("api.openai.com");
        expect(event.policy_violation_flag).toBe(false);
        expect(event.risk_category).toBe("low");
        expect(event.blocked).toBeUndefined();
    });

    it("flags PII in prompt and marks as policy violation", () => {
        const prompt = "Help me write a letter to John Smith at john@company.com";
        const event = buildActivityEvent(OPENAI_URL, prompt);
        expect(event.policy_violation_flag).toBe(true);
        expect(event.sensitivity_categories).toContain("pii");
        expect(event.sensitivity_score).toBeGreaterThan(0);
    });

    it("blocks critical-risk prompt when enforcement_mode=block", () => {
        const prompt =
            "Patient SSN 123-45-6789, diagnosis ICD-10 J45.20, prescription metformin";
        const event = buildActivityEvent(OPENAI_URL, prompt, { enforcement_mode: "block" });
        expect(event.risk_category).toBe("critical");
        expect(event.blocked).toBe(true);
        expect(event.policy_violation_flag).toBe(true);
    });

    it("blocks critical-risk prompt when block_high_risk=true (legacy)", () => {
        const prompt =
            "Patient SSN 123-45-6789, diagnosis ICD-10 J45.20, prescription metformin";
        const event = buildActivityEvent(OPENAI_URL, prompt, { block_high_risk: true });
        expect(event.risk_category).toBe("critical");
        expect(event.blocked).toBe(true);
        expect(event.policy_violation_flag).toBe(true);
    });

    it("does NOT block prompt when enforcement_mode=monitor", () => {
        const prompt = "My SSN is 999-88-7777, please help with my application";
        const event = buildActivityEvent(OPENAI_URL, prompt, { enforcement_mode: "monitor" });
        expect(event.blocked).toBeUndefined();
    });

    it("does NOT block prompt when block_high_risk=false (legacy observe mode)", () => {
        const prompt = "My SSN is 999-88-7777, please help with my application";
        const event = buildActivityEvent(OPENAI_URL, prompt, { block_high_risk: false });
        expect(event.blocked).toBeUndefined();
    });

    it("stores full prompt only in full_audit_mode", () => {
        const prompt = "What is the revenue for Q3?";

        const normalEvent = buildActivityEvent(OPENAI_URL, prompt, {
            full_audit_mode: false,
        });
        expect(normalEvent.full_prompt).toBeUndefined();

        const auditEvent = buildActivityEvent(OPENAI_URL, prompt, {
            full_audit_mode: true,
        });
        expect(auditEvent.full_prompt).toBe(prompt);
    });

    it("attaches attachment_inspection_enabled flag to event", () => {
        const prompt = "Summarize this file";
        const eventWithInspect = buildActivityEvent(OPENAI_URL, prompt, {
            inspect_attachments: true,
        });
        expect(eventWithInspect.attachment_inspection_enabled).toBe(true);

        const eventWithout = buildActivityEvent(OPENAI_URL, prompt, {
            inspect_attachments: false,
        });
        expect(eventWithout.attachment_inspection_enabled).toBe(false);
    });
});

// ─── Claude Desktop App Scenarios ────────────────────────────────────────────

describe("Intercept: Claude Desktop (api.anthropic.com)", () => {
    const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

    it("correctly identifies Claude as the tool", () => {
        const event = buildActivityEvent(ANTHROPIC_URL, "Explain quantum computing");
        expect(event.tool).toBe("Claude / Anthropic");
        expect(event.tool_domain).toBe("api.anthropic.com");
    });

    it("flags trade secrets from desktop app prompt", () => {
        const prompt =
            "This CONFIDENTIAL roadmap for our patent pending algorithm cannot leave this chat";
        const event = buildActivityEvent(ANTHROPIC_URL, prompt);
        expect(event.sensitivity_categories).toContain("trade_secret");
        expect(event.policy_violation_flag).toBe(true);
    });

    it("flags source code submission from Claude Desktop", () => {
        const prompt = `
            const apiKey = process.env.ANTHROPIC_API_KEY;
            async function callClaude(text) {
                return await fetch('https://api.anthropic.com/v1/messages', {
                    headers: { 'x-api-key': apiKey }
                });
            }
        `;
        const event = buildActivityEvent(ANTHROPIC_URL, prompt);
        expect(event.sensitivity_categories).toContain("source_code");
    });

    it("generates non-empty prompt and user hashes", () => {
        const event = buildActivityEvent(ANTHROPIC_URL, "Hello Claude");
        expect(event.prompt_hash).toMatch(/^h_/);
        expect(event.user_hash).toMatch(/^h_/);
        expect(event.prompt_hash).not.toBe(event.user_hash);
    });

    it("tracks token estimate", () => {
        const prompt = "A".repeat(400); // ~100 tokens
        const event = buildActivityEvent(ANTHROPIC_URL, prompt);
        expect(event.token_count_estimate).toBeGreaterThan(0);
        expect(event.prompt_length).toBe(400);
    });
});

// ─── Google Gemini Browser Scenarios ─────────────────────────────────────────

describe("Intercept: Google Gemini (browser/API)", () => {
    const GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

    it("identifies Gemini tool correctly", () => {
        const event = buildActivityEvent(GEMINI_URL, "Generate an essay");
        expect(event.tool).toBe("Google Gemini");
        expect(event.tool_domain).toBe("generativelanguage.googleapis.com");
    });

    it("flags financial data submitted to Gemini (browser)", () => {
        const prompt = "Analyze our Q4 P&L statement: revenue $5.2M, EBITDA $1.1M";
        const event = buildActivityEvent(GEMINI_URL, prompt);
        expect(event.sensitivity_categories).toContain("financial");
        expect(event.policy_violation_flag).toBe(true);
    });
});

// ─── Perplexity Browser Scenarios ────────────────────────────────────────────

describe("Intercept: Perplexity (browser: perplexity.ai)", () => {
    const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

    it("identifies Perplexity tool correctly", () => {
        const event = buildActivityEvent(PERPLEXITY_URL, "What is machine learning?");
        expect(event.tool).toBe("Perplexity");
        expect(event.tool_domain).toBe("api.perplexity.ai");
    });

    it("flags internal URL in Perplexity query", () => {
        const prompt = "Search for docs at http://intranet.corp.local/wiki/api-docs";
        const event = buildActivityEvent(PERPLEXITY_URL, prompt);
        expect(event.sensitivity_categories).toContain("internal_url");
    });
});

// ─── Redaction Integration ────────────────────────────────────────────────────

describe("Redaction: sensitive content stripped before forwarding", () => {
    it("redacts PII before sending to AI provider", () => {
        const original = "My email is secret@company.com and SSN is 123-45-6789";
        const classification = classifyContent(original);

        // Only redact when policy_violation_flag is true and redact_sensitive=true
        expect(classification.policy_violation_flag).toBe(true);

        const redacted = redactSensitiveContent(original);
        expect(redacted).toContain("[REDACTED_EMAIL]");
        expect(redacted).toContain("[REDACTED_SSN]");
        expect(redacted).not.toContain("secret@company.com");
        expect(redacted).not.toContain("123-45-6789");
    });

    it("does not alter clean prompts during redaction", () => {
        const clean = "Explain the theory of relativity in simple terms";
        const redacted = redactSensitiveContent(clean);
        expect(redacted).toBe(clean);
    });
});

// ─── Risk Category Boundary Tests ────────────────────────────────────────────

describe("Risk category boundaries and blocking logic", () => {
    it("low-risk prompt is never blocked even in block mode", () => {
        const prompt = "Tell me a joke";
        const event = buildActivityEvent(
            "https://api.openai.com/v1/chat/completions",
            prompt,
            { enforcement_mode: "block" }
        );
        expect(event.blocked).toBeUndefined();
        expect(event.risk_category).toBe("low");
    });

    it("only critical-risk prompts get blocked in block mode (not high/moderate)", () => {
        // financial data alone should be high or moderate, not always critical
        const prompt = "Our quarterly revenue was $2M";
        const classification = classifyContent(prompt);

        // Should be flagged but not necessarily critical
        expect(classification.policy_violation_flag).toBe(true);
        // blocking only happens at 'critical' in block mode
        const event = buildActivityEvent(
            "https://api.openai.com/v1/chat/completions",
            prompt,
            { enforcement_mode: "block" }
        );
        if (classification.risk_category !== "critical") {
            expect(event.blocked).toBeUndefined();
        }
    });

    it("PHI always results in critical risk regardless of other content", () => {
        const prompt = "Patient diagnosis with ICD-10 code E11.9";
        const classification = classifyContent(prompt);
        expect(classification.risk_category).toBe("critical");
    });
});
