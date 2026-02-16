/**
 * deterministicScanner.js
 * 
 * Local-only, regex-based scanner for PII, secrets, and sensitive patterns.
 * No cloud dependencies.
 */

const crypto = require('crypto');

const PATTERNS = {
    CRITICAL: [
        { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, points: 100 },
        { name: 'Private Key Block', regex: /-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/g, points: 100 }
    ],
    HIGH: [
        { name: 'Credit Card', regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g, points: 25 },
        { name: 'Bank Account/Routing', regex: /\b\d{9}\b.*\b\d{8,12}\b/g, points: 25 }, // Rough pattern
        { name: 'Medical Terminology', regex: /\b(ICD-[910]|MRN:|diagnosis:|patient record)\b/gi, points: 25 }
    ],
    MEDIUM: [
        { name: 'Email Address', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, points: 10 },
        { name: 'Phone Number', regex: /\b(?:\+?1[-. ]?)?\(?([2-9][0-8][0-9])\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})\b/g, points: 10 },
        { name: 'Employee ID', regex: /\bEMP-[A-Z]{2}-\d{4,6}\b/g, points: 10 }
    ],
    LOW: [
        { name: 'Personal Name', regex: /\b(Mr\.|Ms\.|Mrs\.|Dr\.)\s[A-Z][a-z]+\b/g, points: 3 }
    ]
};

/**
 * Calculates entropy of a string
 */
function calculateEntropy(str) {
    const len = str.length;
    if (len === 0) return 0;
    const freq = {};
    for (let i = 0; i < len; i++) {
        const char = str[i];
        freq[char] = (freq[char] || 0) + 1;
    }
    let entropy = 0;
    for (const char in freq) {
        const p = freq[char] / len;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}

/**
 * Scans text for high-entropy secrets (API Keys)
 */
function scanSecrets(text) {
    const findings = [];
    const words = text.split(/\s+/);
    for (const word of words) {
        if (word.length > 32) {
            const entropy = calculateEntropy(word);
            if (entropy > 4.5) {
                findings.push({ name: 'API Key (High Entropy)', points: 100 });
            }
        }
    }
    return findings;
}

/**
 * Main scan function
 */
function scanText(text) {
    if (!text) return { detectedCategories: [], sensitivityPoints: 0 };

    const detectedCategories = [];
    let sensitivityPoints = 0;

    // 1. Check Regex Patterns
    for (const tier in PATTERNS) {
        for (const config of PATTERNS[tier]) {
            const matches = text.match(config.regex);
            if (matches) {
                detectedCategories.push(`${config.name} (${matches.length})`);
                sensitivityPoints += (config.points * matches.length);
            }
        }
    }

    // 2. High Entropy Secrets
    const secretFindings = scanSecrets(text);
    for (const finding of secretFindings) {
        detectedCategories.push(finding.name);
        sensitivityPoints += finding.points;
    }

    // 3. Structured Dataset Check (>25 rows)
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 25) {
        const piiCount = detectedCategories.length;
        if (piiCount > 0) {
            detectedCategories.push('Structured Dataset with PII');
            sensitivityPoints += 100;
        }
    }

    return {
        detectedCategories: [...new Set(detectedCategories)],
        sensitivityPoints
    };
}

module.exports = { scanText };
