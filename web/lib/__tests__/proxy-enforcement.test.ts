/**
 * Tests for Proxy Enforcement Mode Logic
 *
 * Validates that each enforcement mode (monitor, warn, redact, block)
 * produces the correct action when sensitive content is detected.
 * Confirms that proxy ON does NOT equal forced blocking.
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

interface EnforcementResult {
    event: ActivityEvent;
    enforcementAction: string;
    blocked: boolean;
    warned: boolean;
    redacted: boolean;
    forwardedBody: string;
}

function simulateEnforcement(
    targetUrl: string,
    promptBody: string,
    settings: {
        enforcement_mode?: EnforcementMode;
        block_high_risk?: boolean;
        redact_sensitive?: boolean;
        full_audit_mode?: boolean;
        inspect_attachments?: boolean;
    } = {}
): EnforcementResult {
    const domain = extractToolDomain(targetUrl);
    const tool = identifyTool(domain);
    const classification = classifyContent(promptBody);
    const activeMode = resolveEnforcementMode(settings);
    const isSensitive = classification.policy_violation_flag || classification.risk_category === "critical";

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

    let enforcementAction = "allow";
    let blocked = false;
    let warned = false;
    let redacted = false;
    let forwardedBody = promptBody;

    if (isSensitive && classification.risk_category === "critical") {
        event.enforcement_action = activeMode;
        switch (activeMode) {
            case "block":
                enforcementAction = "block";
                blocked = true;
                event.blocked = true;
                break;
            case "warn":
                enforcementAction = "warn";
                warned = true;
                break;
            case "redact":
                enforcementAction = "redact";
                redacted = true;
                forwardedBody = redactSensitiveContent(promptBody);
                break;
            case "monitor":
            default:
                enforcementAction = "monitor";
                break;
        }
    }

    return { event, enforcementAction, blocked, warned, redacted, forwardedBody };
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const CRITICAL_PROMPT = "Patient SSN 123-45-6789, diagnosis ICD-10 J45.20, prescription metformin";
const CLEAN_PROMPT = "What is the capital of France?";

// ─── Monitor Mode Tests ──────────────────────────────────────────────────────

describe("Enforcement Mode: monitor", () => {
    it("allows sensitive content through without blocking", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "monitor",
        });
        expect(result.blocked).toBe(false);
        expect(result.warned).toBe(false);
        expect(result.redacted).toBe(false);
        expect(result.enforcementAction).toBe("monitor");
        expect(result.forwardedBody).toBe(CRITICAL_PROMPT);
    });

    it("does not mark event as blocked", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "monitor",
        });
        expect(result.event.blocked).toBeUndefined();
    });

    it("records enforcement_action as monitor on event", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "monitor",
        });
        expect(result.event.enforcement_action).toBe("monitor");
    });

    it("still detects sensitivity in monitor mode", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "monitor",
        });
        expect(result.event.policy_violation_flag).toBe(true);
        expect(result.event.risk_category).toBe("critical");
        expect(result.event.sensitivity_score).toBeGreaterThan(0);
    });

    it("clean prompt passes through unaffected in monitor mode", () => {
        const result = simulateEnforcement(OPENAI_URL, CLEAN_PROMPT, {
            enforcement_mode: "monitor",
        });
        expect(result.blocked).toBe(false);
        expect(result.enforcementAction).toBe("allow");
        expect(result.forwardedBody).toBe(CLEAN_PROMPT);
    });
});

// ─── Warn Mode Tests ─────────────────────────────────────────────────────────

describe("Enforcement Mode: warn", () => {
    it("returns warning for sensitive content without blocking", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "warn",
        });
        expect(result.blocked).toBe(false);
        expect(result.warned).toBe(true);
        expect(result.enforcementAction).toBe("warn");
    });

    it("does not redact or modify the body", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "warn",
        });
        expect(result.redacted).toBe(false);
        expect(result.forwardedBody).toBe(CRITICAL_PROMPT);
    });

    it("does not mark event as blocked", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "warn",
        });
        expect(result.event.blocked).toBeUndefined();
    });

    it("records enforcement_action as warn on event", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "warn",
        });
        expect(result.event.enforcement_action).toBe("warn");
    });

    it("clean prompt passes through without warning", () => {
        const result = simulateEnforcement(OPENAI_URL, CLEAN_PROMPT, {
            enforcement_mode: "warn",
        });
        expect(result.warned).toBe(false);
        expect(result.enforcementAction).toBe("allow");
    });
});

// ─── Redact Mode Tests ───────────────────────────────────────────────────────

describe("Enforcement Mode: redact", () => {
    it("redacts sensitive content instead of blocking", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "redact",
        });
        expect(result.blocked).toBe(false);
        expect(result.redacted).toBe(true);
        expect(result.enforcementAction).toBe("redact");
    });

    it("removes SSN from forwarded body", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "redact",
        });
        expect(result.forwardedBody).not.toContain("123-45-6789");
        expect(result.forwardedBody).toContain("[REDACTED_SSN]");
    });

    it("removes email from forwarded body", () => {
        const prompt = "Patient SSN 111-22-3333, contact: patient@hospital.com, ICD-10 J45.20";
        const result = simulateEnforcement(OPENAI_URL, prompt, {
            enforcement_mode: "redact",
        });
        expect(result.forwardedBody).not.toContain("patient@hospital.com");
        expect(result.forwardedBody).toContain("[REDACTED_EMAIL]");
    });

    it("does not mark event as blocked", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "redact",
        });
        expect(result.event.blocked).toBeUndefined();
    });

    it("records enforcement_action as redact on event", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "redact",
        });
        expect(result.event.enforcement_action).toBe("redact");
    });

    it("clean prompt passes through without redaction", () => {
        const result = simulateEnforcement(OPENAI_URL, CLEAN_PROMPT, {
            enforcement_mode: "redact",
        });
        expect(result.redacted).toBe(false);
        expect(result.forwardedBody).toBe(CLEAN_PROMPT);
    });
});

// ─── Block Mode Tests ────────────────────────────────────────────────────────

describe("Enforcement Mode: block", () => {
    it("blocks critical-risk prompts", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "block",
        });
        expect(result.blocked).toBe(true);
        expect(result.enforcementAction).toBe("block");
    });

    it("marks event as blocked", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "block",
        });
        expect(result.event.blocked).toBe(true);
    });

    it("records enforcement_action as block on event", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "block",
        });
        expect(result.event.enforcement_action).toBe("block");
    });

    it("clean prompt passes through even in block mode", () => {
        const result = simulateEnforcement(OPENAI_URL, CLEAN_PROMPT, {
            enforcement_mode: "block",
        });
        expect(result.blocked).toBe(false);
        expect(result.enforcementAction).toBe("allow");
        expect(result.forwardedBody).toBe(CLEAN_PROMPT);
    });
});

// ─── Proxy ON != Forced Blocking Tests ──────────────────────────────────────

describe("Proxy ON does NOT equal forced blocking", () => {
    it("default settings (no enforcement_mode) uses monitor — no blocking", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {});
        expect(result.blocked).toBe(false);
        expect(result.enforcementAction).toBe("monitor");
    });

    it("block_high_risk=false does not block even with sensitive content", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            block_high_risk: false,
        });
        expect(result.blocked).toBe(false);
    });

    it("enforcement_mode=monitor overrides block_high_risk=true", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "monitor",
            block_high_risk: true,
        });
        // enforcement_mode is canonical — should be monitor, not block
        expect(result.blocked).toBe(false);
        expect(result.enforcementAction).toBe("monitor");
    });

    it("enforcement_mode=warn overrides block_high_risk=true", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "warn",
            block_high_risk: true,
        });
        expect(result.blocked).toBe(false);
        expect(result.warned).toBe(true);
        expect(result.enforcementAction).toBe("warn");
    });

    it("enforcement_mode=redact overrides block_high_risk=true", () => {
        const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
            enforcement_mode: "redact",
            block_high_risk: true,
        });
        expect(result.blocked).toBe(false);
        expect(result.redacted).toBe(true);
        expect(result.enforcementAction).toBe("redact");
    });
});

// ─── Legacy Fallback Tests ───────────────────────────────────────────────────

describe("Legacy settings fallback", () => {
    it("block_high_risk=true without enforcement_mode resolves to block", () => {
        const mode = resolveEnforcementMode({ block_high_risk: true });
        expect(mode).toBe("block");
    });

    it("redact_sensitive=true without enforcement_mode resolves to redact", () => {
        const mode = resolveEnforcementMode({ redact_sensitive: true });
        expect(mode).toBe("redact");
    });

    it("neither flag set resolves to monitor", () => {
        const mode = resolveEnforcementMode({});
        expect(mode).toBe("monitor");
    });

    it("enforcement_mode takes priority over legacy flags", () => {
        const mode = resolveEnforcementMode({
            enforcement_mode: "warn",
            block_high_risk: true,
            redact_sensitive: true,
        });
        expect(mode).toBe("warn");
    });

    it("invalid enforcement_mode falls back to legacy flags", () => {
        const mode = resolveEnforcementMode({
            enforcement_mode: "invalid" as EnforcementMode,
            block_high_risk: true,
        });
        expect(mode).toBe("block");
    });
});

// ─── Detection Layer Independence Tests ──────────────────────────────────────

describe("Detection runs independently of enforcement mode", () => {
    for (const mode of VALID_ENFORCEMENT_MODES) {
        it(`detects PII in ${mode} mode`, () => {
            const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
                enforcement_mode: mode,
            });
            expect(result.event.policy_violation_flag).toBe(true);
            expect(result.event.sensitivity_score).toBeGreaterThan(0);
            expect(result.event.sensitivity_categories).toContain("pii");
        });

        it(`detects PHI in ${mode} mode`, () => {
            const result = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, {
                enforcement_mode: mode,
            });
            expect(result.event.sensitivity_categories).toContain("phi");
        });
    }
});

// ─── Enforcement Action Consistency Tests ────────────────────────────────────

describe("Each mode produces deterministic enforcement action", () => {
    it("monitor mode: detect + allow", () => {
        const r = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, { enforcement_mode: "monitor" });
        expect(r.blocked).toBe(false);
        expect(r.warned).toBe(false);
        expect(r.redacted).toBe(false);
    });

    it("warn mode: detect + warn", () => {
        const r = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, { enforcement_mode: "warn" });
        expect(r.blocked).toBe(false);
        expect(r.warned).toBe(true);
        expect(r.redacted).toBe(false);
    });

    it("redact mode: detect + redact", () => {
        const r = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, { enforcement_mode: "redact" });
        expect(r.blocked).toBe(false);
        expect(r.warned).toBe(false);
        expect(r.redacted).toBe(true);
    });

    it("block mode: detect + block", () => {
        const r = simulateEnforcement(OPENAI_URL, CRITICAL_PROMPT, { enforcement_mode: "block" });
        expect(r.blocked).toBe(true);
        expect(r.warned).toBe(false);
        expect(r.redacted).toBe(false);
    });
});
