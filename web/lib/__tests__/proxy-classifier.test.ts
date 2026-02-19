/**
 * Tests for the Proxy Classification Engine
 *
 * Covers sensitive prompt detection scenarios from AI browsers (ChatGPT web,
 * Claude.ai, Perplexity) and desktop apps (ChatGPT Desktop, Claude Desktop).
 */
import { describe, it, expect } from "vitest";
import {
    classifyContent,
    estimateTokens,
    hashString,
    extractToolDomain,
    identifyTool,
    redactSensitiveContent,
} from "../proxy-classifier";

// ─── PII Detection ──────────────────────────────────────────────────────────

describe("classifyContent — PII detection", () => {
    it("flags SSN in prompt (browser: ChatGPT web)", () => {
        const prompt = "My SSN is 123-45-6789, can you help me fill out this form?";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
        expect(result.policy_violation_flag).toBe(true);
        expect(result.sensitivity_score).toBeGreaterThan(0);
        expect(["moderate", "high", "critical"]).toContain(result.risk_category);
    });

    it("flags email address in prompt (desktop: Claude Desktop)", () => {
        const prompt = "Send this summary to john.doe@acme-internal.com";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags full name in prompt (browser: Perplexity)", () => {
        const prompt = "I'm writing a contract for Sarah Johnson, can you draft it?";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
    });

    it("flags phone number in prompt (desktop: ChatGPT Desktop)", () => {
        const prompt = "Call me at 555-867-5309 to discuss the project";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags street address (browser: Claude.ai)", () => {
        const prompt = "My address is 123 Main St, please send mail here";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
    });

    it("multiple PII types escalate to critical risk", () => {
        const prompt =
            "Name: John Smith, SSN: 123-45-6789, email: john@company.com, DOB: 1990-01-01";
        const result = classifyContent(prompt);
        // Multiple PII matches trigger critical via the (pii && matchCount > 1) rule
        expect(result.risk_category).toBe("critical");
        // Score may be below 80 but still critical due to multi-match rule
        expect(result.sensitivity_score).toBeGreaterThan(50);
        expect(result.policy_violation_flag).toBe(true);
    });
});

// ─── Financial Data Detection ────────────────────────────────────────────────

describe("classifyContent — Financial data detection", () => {
    it("flags credit card number (browser: ChatGPT web)", () => {
        const prompt = "My card number is 4111 1111 1111 1111, please help me dispute a charge";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("financial");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags IBAN/SWIFT code (desktop: any AI desktop app)", () => {
        const prompt = "Wire transfer to IBAN: GB29NWBK60161331926819";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("financial");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags P&L and earnings references (browser: Perplexity)", () => {
        const prompt = "Our Q3 P&L shows $2.4M revenue, annual earnings of $800K";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("financial");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags salary information (desktop: Claude Desktop)", () => {
        const prompt = "The compensation package includes a salary of $150,000 plus bonus";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("financial");
    });
});

// ─── PHI Detection ───────────────────────────────────────────────────────────

describe("classifyContent — Protected Health Information (PHI)", () => {
    it("flags patient medical records (browser: ChatGPT web)", () => {
        const prompt =
            "The patient has a diagnosis of Type 2 diabetes. Medical record #MR-12345.";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("phi");
        expect(result.policy_violation_flag).toBe(true);
        expect(result.risk_category).toBe("critical");
    });

    it("flags ICD medical codes (desktop: Claude Desktop)", () => {
        const prompt = "ICD-10 code E11.9 for uncontrolled diabetes, CPT code 99213";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("phi");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags treatment and prescription details (browser: Perplexity)", () => {
        const prompt =
            "The treatment plan includes a prescription for metformin 500mg, blood pressure check";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("phi");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("PHI immediately escalates to critical risk", () => {
        const prompt = "Patient HIPAA record shows MRI results and biopsy findings";
        const result = classifyContent(prompt);
        expect(result.risk_category).toBe("critical");
    });
});

// ─── Source Code Detection ────────────────────────────────────────────────────

describe("classifyContent — Source code detection", () => {
    it("detects TypeScript/JavaScript code (browser: ChatGPT web)", () => {
        const prompt = `
            function processPayment(userId: string, amount: number) {
                const result = await fetch('/api/charge', { method: 'POST' });
                return result;
            }
        `;
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("source_code");
    });

    it("detects SQL queries (desktop: Claude Desktop)", () => {
        const prompt =
            "SELECT * FROM users WHERE email = 'admin@company.com' AND password = 'secret123'";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("source_code");
    });

    it("detects Python code (browser: Perplexity)", () => {
        const prompt = `
            import os
            from anthropic import Anthropic
            def call_claude(prompt):
                client = Anthropic()
                return client.messages.create(model="claude-3", messages=[{"role": "user", "content": prompt}])
        `;
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("source_code");
    });

    it("detects import statements (desktop: ChatGPT Desktop)", () => {
        const prompt = "import { useState } from 'react';\nconst App = () => { return <div/>; }";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("source_code");
    });
});

// ─── Trade Secret Detection ───────────────────────────────────────────────────

describe("classifyContent — Trade secret detection", () => {
    it("flags confidential documents (browser: ChatGPT web)", () => {
        const prompt =
            "This is a CONFIDENTIAL strategic plan for our market expansion in Q4 2026.";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("trade_secret");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags NDA references (desktop: Claude Desktop)", () => {
        const prompt =
            "Under the NDA signed last year, this proprietary algorithm cannot be shared.";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("trade_secret");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags patent pending information (browser: Perplexity)", () => {
        const prompt =
            "Our patent pending process for quantum encryption involves this methodology...";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("trade_secret");
        expect(result.policy_violation_flag).toBe(true);
    });

    it("flags unreleased product information (desktop: ChatGPT Desktop)", () => {
        const prompt =
            "The upcoming prototype we're launching next month has these features...";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("trade_secret");
    });
});

// ─── Internal URL Detection ───────────────────────────────────────────────────

describe("classifyContent — Internal URL/domain detection", () => {
    it("flags internal network IPs (browser: Claude.ai)", () => {
        const prompt = "The database is at 192.168.1.100, admin panel at 10.0.0.5:8080";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("internal_url");
    });

    it("flags internal domain names (desktop: any)", () => {
        const prompt = "Connect to https://api.corp.internal/v1/secret-endpoint";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("internal_url");
    });

    it("flags localhost URLs (browser: ChatGPT web)", () => {
        const prompt = "My local server is at http://localhost:3000/admin";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("internal_url");
    });
});

// ─── Clean Prompts ────────────────────────────────────────────────────────────

describe("classifyContent — Clean prompts (no sensitivity)", () => {
    it("marks general knowledge question as none (browser: ChatGPT web)", () => {
        const prompt = "What is the capital of France?";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("none");
        expect(result.policy_violation_flag).toBe(false);
        expect(result.sensitivity_score).toBe(0);
        expect(result.risk_category).toBe("low");
    });

    it("marks code help question as low risk (desktop: Claude Desktop)", () => {
        const prompt = "How do I center a div in CSS?";
        const result = classifyContent(prompt);
        expect(result.policy_violation_flag).toBe(false);
    });

    it("marks creative writing prompt as none (browser: Perplexity)", () => {
        const prompt = "Write me a short poem about the ocean";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("none");
        expect(result.policy_violation_flag).toBe(false);
    });
});

// ─── Multi-Category Prompts ───────────────────────────────────────────────────

describe("classifyContent — Multi-category high-risk prompts", () => {
    it("detects combined PII + financial data (browser: ChatGPT web)", () => {
        const prompt =
            "John Smith's account number 1234567890, routing 021000021, salary $120,000 per year";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
        expect(result.categories_detected).toContain("financial");
        expect(result.policy_violation_flag).toBe(true);
        expect(result.sensitivity_score).toBeGreaterThan(50);
    });

    it("detects source code with internal URLs (desktop: ChatGPT Desktop)", () => {
        const prompt = `
            const API_URL = 'http://10.0.0.5:8080/internal';
            function callInternalAPI(data) {
                return fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
            }
        `;
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("source_code");
        expect(result.categories_detected).toContain("internal_url");
    });

    it("detects PHI + PII combination (browser: Claude.ai)", () => {
        const prompt =
            "Patient John Doe (john@clinic.com) has diagnosis ICD-10 J45.20 with prescription history";
        const result = classifyContent(prompt);
        expect(result.categories_detected).toContain("pii");
        expect(result.categories_detected).toContain("phi");
        expect(result.risk_category).toBe("critical");
        expect(result.policy_violation_flag).toBe(true);
    });
});

// ─── Utility Functions ────────────────────────────────────────────────────────

describe("estimateTokens", () => {
    it("estimates tokens for short prompt", () => {
        const tokens = estimateTokens("Hello, world!");
        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBeLessThan(10);
    });

    it("estimates tokens for long prompt", () => {
        const longText = "a".repeat(400);
        const tokens = estimateTokens(longText);
        expect(tokens).toBe(100); // 400 chars / 4 chars per token
    });

    it("returns 0 for empty string", () => {
        expect(estimateTokens("")).toBe(0);
    });
});

describe("hashString", () => {
    it("produces consistent hashes for the same input", () => {
        const h1 = hashString("test@example.com");
        const h2 = hashString("test@example.com");
        expect(h1).toBe(h2);
    });

    it("produces different hashes for different inputs", () => {
        const h1 = hashString("user1@example.com");
        const h2 = hashString("user2@example.com");
        expect(h1).not.toBe(h2);
    });

    it("hash starts with h_ prefix", () => {
        const hash = hashString("some-input");
        expect(hash).toMatch(/^h_/);
    });
});

describe("extractToolDomain", () => {
    it("extracts domain from OpenAI API URL (browser/desktop)", () => {
        expect(extractToolDomain("https://api.openai.com/v1/chat/completions")).toBe(
            "api.openai.com"
        );
    });

    it("extracts domain from Anthropic API URL (Claude Desktop)", () => {
        expect(extractToolDomain("https://api.anthropic.com/v1/messages")).toBe(
            "api.anthropic.com"
        );
    });

    it("extracts domain from ChatGPT web URL (browser)", () => {
        expect(extractToolDomain("https://chatgpt.com/backend-api/conversation")).toBe(
            "chatgpt.com"
        );
    });

    it("returns unknown for invalid URL", () => {
        expect(extractToolDomain("not-a-url")).toBe("unknown");
    });
});

describe("identifyTool", () => {
    it("maps api.openai.com to ChatGPT (browser: ChatGPT web)", () => {
        expect(identifyTool("api.openai.com")).toBe("ChatGPT / OpenAI");
    });

    it("maps api.anthropic.com to Claude (desktop: Claude Desktop)", () => {
        expect(identifyTool("api.anthropic.com")).toBe("Claude / Anthropic");
    });

    it("maps generativelanguage.googleapis.com to Google Gemini", () => {
        expect(identifyTool("generativelanguage.googleapis.com")).toBe("Google Gemini");
    });

    it("returns generic name for unknown domains", () => {
        const name = identifyTool("unknown-ai-provider.com");
        expect(name).toContain("unknown-ai-provider.com");
    });
});

// ─── Redaction ────────────────────────────────────────────────────────────────

describe("redactSensitiveContent", () => {
    it("redacts email addresses (browser: ChatGPT web)", () => {
        const result = redactSensitiveContent("Contact me at user@company.com for details");
        expect(result).toContain("[REDACTED_EMAIL]");
        expect(result).not.toContain("user@company.com");
    });

    it("redacts SSNs (desktop: Claude Desktop)", () => {
        const result = redactSensitiveContent("My SSN is 123-45-6789");
        expect(result).toContain("[REDACTED_SSN]");
        expect(result).not.toContain("123-45-6789");
    });

    it("redacts credit card numbers (browser: Perplexity)", () => {
        const result = redactSensitiveContent("Card: 4111 1111 1111 1111");
        expect(result).toContain("[REDACTED_CC]");
        expect(result).not.toContain("4111 1111 1111 1111");
    });

    it("redacts phone numbers (desktop: ChatGPT Desktop)", () => {
        const result = redactSensitiveContent("Call me at 555-867-5309 to discuss");
        expect(result).toContain("[REDACTED_PHONE]");
        expect(result).not.toContain("555-867-5309");
    });

    it("redacts internal IP addresses (desktop: Claude Desktop)", () => {
        const result = redactSensitiveContent("Server at 192.168.1.100 is down");
        expect(result).toContain("[REDACTED_IP]");
        expect(result).not.toContain("192.168.1.100");
    });

    it("preserves non-sensitive content after redaction", () => {
        const result = redactSensitiveContent(
            "Hello! My email is test@example.com. How are you?"
        );
        expect(result).toContain("Hello!");
        expect(result).toContain("How are you?");
    });

    it("handles multiple types in one prompt (browser: ChatGPT web)", () => {
        const prompt =
            "Name: John, SSN: 123-45-6789, email: john@corp.com, card: 4111-1111-1111-1111";
        const result = redactSensitiveContent(prompt);
        expect(result).toContain("[REDACTED_SSN]");
        expect(result).toContain("[REDACTED_EMAIL]");
        expect(result).toContain("[REDACTED_CC]");
        expect(result).not.toContain("123-45-6789");
        expect(result).not.toContain("john@corp.com");
    });
});
