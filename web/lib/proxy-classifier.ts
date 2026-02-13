/**
 * Complyze — Proxy Classification Engine
 *
 * Lightweight, deterministic content classification using regex + keyword detection.
 * Runs on every outbound AI request when proxy monitoring is enabled.
 *
 * Categories:
 *   - PII: names, emails, SSNs, phone numbers, addresses
 *   - Financial: account numbers, credit cards, financial terms
 *   - Source Code: code patterns, function definitions, imports
 *   - PHI: medical terms, diagnosis codes, health records
 *   - Trade Secrets: proprietary markers, confidential keywords
 *   - Internal URLs: internal domain / IP patterns
 */

import type { ClassificationResult, SensitivityCategory } from "./proxy-types";

/* ── Pattern Definitions ── */

const PII_PATTERNS: RegExp[] = [
    /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/,                         // Names (FirstName LastName)
    /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,                            // Email
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,                     // SSN
    /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone
    /\b\d{1,5}\s\w+(?:\s\w+)*\s(?:St|Ave|Blvd|Dr|Rd|Ct|Ln|Way|Pl)\b/i, // Street Address
    /\b(?:date of birth|DOB|social security|passport)\b/i,
];

const FINANCIAL_PATTERNS: RegExp[] = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,           // Credit card
    /\b(?:routing|account)\s*(?:number|#|no\.?)\s*:?\s*\d+/i,  // Account/Routing
    /\b(?:IBAN|SWIFT|BIC)\s*:?\s*[A-Z0-9]+/i,
    /\$[\d,]+\.?\d*/,                                          // Dollar amounts
    /\b(?:revenue|profit|loss|margin|EBITDA|earnings|salary|compensation|bonus)\b/i,
    /\b(?:quarterly|annual)\s+(?:report|earnings|revenue)\b/i,
    /\b(?:P&L|balance sheet|income statement|cash flow)\b/i,
];

const SOURCE_CODE_PATTERNS: RegExp[] = [
    /\b(?:function|const|let|var|class|interface|type|enum)\s+\w+/,
    /\b(?:import|export|require|from)\s+['"@]/,
    /\b(?:if|else|for|while|switch|try|catch|finally)\s*\(/,
    /\b(?:return|throw|yield|await)\s+/,
    /(?:=>|\.map\(|\.filter\(|\.reduce\(|\.forEach\()/,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/i,
    /\b(?:def|class|import|from|elif|except|lambda)\b/,        // Python
    /\{[\s\S]*(?:=>|return)[\s\S]*\}/,                         // Arrow/block patterns
    /\/\*[\s\S]*?\*\//,                                         // Block comments
    /^\s*\/\/.+$/m,                                             // Line comments
];

const PHI_PATTERNS: RegExp[] = [
    /\b(?:diagnosis|prognosis|treatment|prescription|medication)\b/i,
    /\b(?:ICD-?\d{1,2}|CPT|HCPCS|NDC)\b/i,                   // Medical codes
    /\b(?:patient|medical record|health record|HIPAA|PHI)\b/i,
    /\b(?:blood pressure|heart rate|glucose|cholesterol|BMI)\b/i,
    /\b(?:MRI|CT scan|X-ray|ultrasound|biopsy)\b/i,
    /\b(?:allergy|allergies|condition|symptoms|chronic)\b/i,
];

const TRADE_SECRET_PATTERNS: RegExp[] = [
    /\b(?:confidential|proprietary|trade secret|internal only)\b/i,
    /\b(?:NDA|non-disclosure|classified|restricted)\b/i,
    /\b(?:patent pending|patent application|invention disclosure)\b/i,
    /\b(?:strategic plan|roadmap|competitive analysis)\b/i,
    /\b(?:algorithm|formula|process|methodology)\s+(?:for|to|that)\b/i,
    /\b(?:unreleased|pre-release|upcoming|prototype)\b/i,
];

const INTERNAL_URL_PATTERNS: RegExp[] = [
    /\b(?:https?:\/\/)?(?:[\w-]+\.)?(?:internal|intranet|corp|local)\.\w+/i,
    /\b(?:https?:\/\/)?(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}/,
    /\b(?:https?:\/\/)?localhost(?::\d+)?/i,
    /\b(?:https?:\/\/)?[\w-]+\.(?:internal|corp|local|lan)\b/i,
    /\b(?:jira|confluence|slack|notion|figma)\.[\w-]+\.(?:com|io|net)\b/i,
];

/* ── Classification Engine ── */

interface PatternGroup {
    category: SensitivityCategory;
    patterns: RegExp[];
    weight: number;        // severity weight 1–5
    label: string;
}

const PATTERN_GROUPS: PatternGroup[] = [
    { category: "pii", patterns: PII_PATTERNS, weight: 4, label: "PII Detected" },
    { category: "financial", patterns: FINANCIAL_PATTERNS, weight: 4, label: "Financial Data" },
    { category: "source_code", patterns: SOURCE_CODE_PATTERNS, weight: 2, label: "Source Code" },
    { category: "phi", patterns: PHI_PATTERNS, weight: 5, label: "Protected Health Info" },
    { category: "trade_secret", patterns: TRADE_SECRET_PATTERNS, weight: 5, label: "Trade Secret Indicators" },
    { category: "internal_url", patterns: INTERNAL_URL_PATTERNS, weight: 3, label: "Internal URLs/Domains" },
];

/**
 * Classify a prompt/request body for sensitive content.
 * Returns a deterministic classification result.
 */
export function classifyContent(text: string): ClassificationResult {
    const categories: SensitivityCategory[] = [];
    const details: string[] = [];
    let totalScore = 0;
    let matchCount = 0;

    for (const group of PATTERN_GROUPS) {
        const groupMatches = group.patterns.filter((pattern) => pattern.test(text));
        if (groupMatches.length > 0) {
            categories.push(group.category);
            const groupScore = Math.min(groupMatches.length * group.weight, 20);
            totalScore += groupScore;
            matchCount += groupMatches.length;
            details.push(
                `${group.label}: ${groupMatches.length} pattern${groupMatches.length > 1 ? "s" : ""} matched`
            );
        }
    }

    // Normalize to 0–100 scale
    const sensitivityScore = Math.min(Math.round((totalScore / 40) * 100), 100);

    // Determine risk category
    let riskCategory: string;
    if (sensitivityScore >= 75) {
        riskCategory = "critical";
    } else if (sensitivityScore >= 50) {
        riskCategory = "high";
    } else if (sensitivityScore >= 25) {
        riskCategory = "moderate";
    } else {
        riskCategory = "low";
    }

    // Policy violation if any high-weight category detected
    const policyViolation = categories.some((c) =>
        ["pii", "phi", "trade_secret", "financial"].includes(c)
    );

    if (categories.length === 0) {
        categories.push("none");
    }

    return {
        categories_detected: categories,
        sensitivity_score: sensitivityScore,
        policy_violation_flag: policyViolation,
        risk_category: riskCategory,
        details: details.length > 0 ? details : ["No sensitive content detected"],
    };
}

/**
 * Estimate token count from text (rough approximation).
 */
export function estimateTokens(text: string): number {
    // Average ~4 characters per token for English text
    return Math.ceil(text.length / 4);
}

/**
 * Generate a salted hash of a string (for prompt/user hashing).
 * Uses a simple but fast hash — not cryptographic, but deterministic.
 */
export function hashString(input: string, salt: string = "complyze_salt_2026"): string {
    const combined = salt + input;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0;
    }
    return "h_" + Math.abs(hash).toString(36).padStart(8, "0");
}

/**
 * Extract the AI tool domain from a URL.
 */
export function extractToolDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return "unknown";
    }
}

/**
 * Map a domain to a known AI tool name.
 */
const DOMAIN_TO_TOOL: Record<string, string> = {
    "api.openai.com": "ChatGPT / OpenAI",
    "api.anthropic.com": "Claude / Anthropic",
    "generativelanguage.googleapis.com": "Google Gemini",
    "api.cohere.ai": "Cohere",
    "api.mistral.ai": "Mistral",
    "openrouter.ai": "OpenRouter",
    "api.replicate.com": "Replicate",
    "api-inference.huggingface.co": "Hugging Face",
    "api.together.xyz": "Together AI",
    "api.fireworks.ai": "Fireworks AI",
    "api.perplexity.ai": "Perplexity",
    "api.groq.com": "Groq",
};

export function identifyTool(domain: string): string {
    return DOMAIN_TO_TOOL[domain] || `AI Tool (${domain})`;
}

/**
 * Redact sensitive content from text before forwarding.
 * Replaces detected patterns with [REDACTED] markers.
 */
export function redactSensitiveContent(text: string): string {
    let redacted = text;

    // Redact emails
    redacted = redacted.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[REDACTED_EMAIL]");

    // Redact SSNs
    redacted = redacted.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[REDACTED_SSN]");

    // Redact credit cards
    redacted = redacted.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[REDACTED_CC]");

    // Redact phone numbers
    redacted = redacted.replace(
        /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        "[REDACTED_PHONE]"
    );

    // Redact internal IPs
    redacted = redacted.replace(
        /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g,
        "[REDACTED_IP]"
    );

    return redacted;
}
