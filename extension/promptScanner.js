/**
 * promptScanner.js — Complyze Zero-Trust Shield v1.4.0
 *
 * Content script injected into AI platform pages.
 * Intercepts prompts BEFORE they reach the AI provider.
 *
 * Enforcement pipeline:
 *  1. Client-side DLP preflight (regex) — generates SIGNAL only, NEVER a blocking decision
 *  2. Local Ollama analysis — extension calls http://localhost:11434 directly for LLM evaluation
 *  3. If local Ollama unavailable, fall back to backend scan (which also calls Ollama)
 *  4. Policy decision is derived exclusively from LLM output — never from regex
 *  5. Extension enforces that decision in-page
 *  6. Overlay feedback shown; lastScanResult written to storage for popup display
 *
 * IMPORTANT: Regex patterns are SIGNALS only. They are forwarded as context to Ollama.
 * No blocking, redaction, or enforcement decision may originate from regex alone.
 *
 * Debug fields in every response:
 *   model_used      — was Ollama consulted? (always true in normal flow)
 *   policy_used     — was org policy applied?
 *   blocked_locally — was this a local Ollama decision?
 *   decision_source — "local_ollama" | "backend_policy"
 */

'use strict';

// ── Client-side DLP Patterns ────────────────────────────────────────────────────
// ORDER MATTERS: patterns are evaluated top-to-bottom. Higher-severity first.
// Each pattern must fire BEFORE the safe notification is ever shown.
const DLP_PATTERNS = [
    // ── AWS Credentials ──────────────────────────────────────────────────────
    {
        id: 'aws_access_key', label: 'AWS Access Key',
        // Standard is 20 chars total (4 prefix + 16 body). 
        // We relax to 12-20 body chars to catch dummy test keys often used by users.
        pattern: /\b(AKIA|AGPA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,20}\b/g,
        action: 'block', replacement: '[AWS_ACCESS_KEY_REDACTED]', severity: 'critical',
    },
    {
        id: 'aws_secret_labeled', label: 'AWS Secret Key',
        // Relaxes to 12+ body chars to catch dummy test keys.
        pattern: /(?:aws[_\-\s]?(?:secret[_\-\s]?)?(?:access[_\-\s]?)?key(?:[_\-\s]?id)?\s*[:=]\s*)[A-Za-z0-9/+=]{12,}/gi,
        action: 'block', replacement: '[AWS_SECRET_REDACTED]', severity: 'critical',
    },
    {
        id: 'aws_secret_bare', label: 'AWS Secret Key (bare)',
        // Catches bare 40-char base64 secrets common in AWS: AKIA... followed soon after by a 40-char string
        pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
        action: 'redact', replacement: '[SECRET_REDACTED]', severity: 'high',
    },
    // ── SSN ──────────────────────────────────────────────────────────────────
    {
        id: 'ssn_strict', label: 'Social Security Number',
        pattern: /\b(?!000|666|9\d{2})\d{3}[-]\d{2}[-]\d{4}\b/g,
        action: 'block', replacement: '[SSN REDACTED]', severity: 'critical',
    },
    {
        id: 'ssn_contextual', label: 'Social Security Number (contextual)',
        pattern: /(?:social[-\s]?security(?:[-\s]?number)?|\bssn\b)\s*(?:is|:|=)?\s*[\d][\d\s\-\.]{6,}[\d]/gi,
        action: 'block', replacement: '[SSN REDACTED]', severity: 'critical',
    },
    {
        id: 'ssn_loose', label: 'SSN-like Number',
        pattern: /\b\d{3,4}[-\s.]{1,2}\d{2}[-\s.]{1,2}\d{4,5}\b/g,
        action: 'block', replacement: '[SSN REDACTED]', severity: 'critical',
    },
    // ── API Keys ─────────────────────────────────────────────────────────────
    {
        id: 'openai_key', label: 'OpenAI API Key',
        // sk-... and sk-proj-...
        pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g,
        action: 'block', replacement: '[OPENAI_KEY_REDACTED]', severity: 'critical',
    },
    {
        id: 'github_pat', label: 'GitHub Personal Access Token',
        pattern: /\bghp_[A-Za-z0-9]{36}\b|\bgho_[A-Za-z0-9]{36}\b|\bghs_[A-Za-z0-9]{36}\b/g,
        action: 'block', replacement: '[GITHUB_TOKEN_REDACTED]', severity: 'critical',
    },
    {
        id: 'api_key_generic', label: 'API Key / Token',
        pattern: /(?:api[-_]?key|secret[_-]?key|bearer|auth[-_]?token|access[-_]?token)\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}["']?/gi,
        action: 'redact', replacement: '[API_KEY_REDACTED]', severity: 'high',
    },
    // ── Financial ─────────────────────────────────────────────────────────────
    {
        id: 'credit_card', label: 'Credit Card Number',
        pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|[25][1-7][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11})\b/g,
        action: 'block', replacement: '[CREDIT CARD REDACTED]', severity: 'critical',
    },
    // ── Keys & Passwords ──────────────────────────────────────────────────────
    {
        id: 'private_key', label: 'Private Key',
        pattern: /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+)?PRIVATE KEY-----/gi,
        action: 'block', replacement: '[PRIVATE KEY REDACTED]', severity: 'critical',
    },
    {
        id: 'password', label: 'Inline Password',
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?(?!\*{3})[^\s"']{6,}["']?/gi,
        action: 'redact', replacement: 'password=[REDACTED]', severity: 'high',
    },
];

// ── Local Ollama Client ───────────────────────────────────────────────────────
// All prompt risk decisions MUST originate from the local Ollama model.
// Regex DLP findings above are forwarded as context only — never used to block.

const OLLAMA_LOCAL_URL = 'http://localhost:11434/api/generate';
const OLLAMA_LOCAL_MODEL = 'complyze-qwen';
const OLLAMA_TIMEOUT_MS = 10000; // 10 s — local inference should be fast

/**
 * Expected LLM output schema:
 * {
 *   "risk_score": 0-100,
 *   "risk_type": ["PII","Secrets","Credentials","Safe"],
 *   "confidence": 0-1,
 *   "recommended_action": "allow | redact | audit | block"
 * }
 */
const OLLAMA_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        risk_score: { type: 'integer', minimum: 0, maximum: 100 },
        risk_type: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        recommended_action: { type: 'string' },
    },
    required: ['risk_score', 'risk_type', 'confidence', 'recommended_action'],
};

/**
 * callLocalOllama — sends the prompt to the local Ollama instance and returns
 * a structured risk decision.  Returns null if Ollama is unreachable or times out.
 *
 * @param {string} promptText      The raw user prompt
 * @param {Array}  dlpFindings     Advisory DLP signals to include as context
 * @returns {Promise<{risk_score, risk_type, confidence, recommended_action}|null>}
 */
async function callLocalOllama(promptText, dlpFindings) {
    const systemInstruction = [
        'You are a security model that detects sensitive information in prompts.',
        'Evaluate the prompt below and return ONLY a JSON object with these fields:',
        '  risk_score (integer 0-100): overall risk level',
        '  risk_type (array of strings): detected categories, e.g. ["PII","Secrets","Credentials","Safe"]',
        '  confidence (number 0-1): confidence in the assessment',
        '  recommended_action (string): one of "allow", "redact", "audit", "block"',
        '',
        'Rules:',
        '  0-20   → low risk    → recommended_action: "allow"',
        '  21-45  → medium risk → recommended_action: "audit"',
        '  46-75  → high risk   → recommended_action: "redact"',
        '  76-100 → critical    → recommended_action: "block"',
        '',
        'Additional DLP signals detected by the client (treat as advisory context, not facts):',
        JSON.stringify(dlpFindings || []),
        '',
        'Return ONLY the JSON object — no commentary, no markdown fences.',
    ].join('\n');

    const body = JSON.stringify({
        model: OLLAMA_LOCAL_MODEL,
        prompt: promptText,
        system: systemInstruction,
        stream: false,
        format: OLLAMA_RESPONSE_SCHEMA,
    });

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

        let res;
        try {
            res = await fetch(OLLAMA_LOCAL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            console.warn(`[Complyze] Local Ollama HTTP error: ${res.status}`);
            return null;
        }

        const raw = await res.text();
        let envelope;
        try { envelope = JSON.parse(raw); } catch {
            console.warn('[Complyze] Local Ollama: outer JSON parse failed');
            return null;
        }

        // Ollama wraps the model output in a `response` string field
        const inner = typeof envelope.response === 'string' ? envelope.response : raw;
        let parsed;
        try { parsed = JSON.parse(inner); } catch {
            // Some models return the JSON directly without an envelope
            try { parsed = typeof inner === 'object' ? inner : JSON.parse(raw); } catch {
                console.warn('[Complyze] Local Ollama: inner JSON parse failed');
                return null;
            }
        }

        // Normalise and validate required fields
        const risk_score = typeof parsed.risk_score === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.risk_score))) : 0;
        const risk_type = Array.isArray(parsed.risk_type) ? parsed.risk_type : ['Safe'];
        const confidence = typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
        const validActions = new Set(['allow', 'redact', 'audit', 'block']);
        const recommended_action = validActions.has(parsed.recommended_action)
            ? parsed.recommended_action : 'audit';

        console.log('[Complyze] Local Ollama decision:', { risk_score, risk_type, confidence, recommended_action });
        return { risk_score, risk_type, confidence, recommended_action };
    } catch (err) {
        if (err && err.name === 'AbortError') {
            console.warn('[Complyze] Local Ollama timed out — falling back to backend');
        } else {
            console.warn('[Complyze] Local Ollama unreachable:', err && err.message);
        }
        return null;
    }
}

/**
 * mapOllamaDecision — converts a local Ollama response into the same shape
 * that the backend /api/scanPrompt returns, so the rest of the enforcement
 * code (enforceBlock / enforceRedaction / showOverlay) stays unchanged.
 */
function mapOllamaDecision(ollamaResult) {
    const { risk_score, risk_type, confidence, recommended_action } = ollamaResult;
    const actionMap = { allow: 'allow', audit: 'warn', redact: 'redact', block: 'block' };
    const action = actionMap[recommended_action] || 'warn';

    return {
        riskScore: risk_score,
        action,
        message: `Local Ollama analysis: ${risk_type.join(', ')} (score ${risk_score})`,
        policy_decision: {
            action,
            reason: `Ollama detected: ${risk_type.join(', ')} with confidence ${confidence.toFixed(2)}`,
            source: 'local_ollama',
        },
        analysis_result: { findings: [], sensitive_categories: risk_type },
        decision_source: 'local_ollama',
        model_used: true,
        policy_used: false,
        blocked_locally: true,
    };
}

// ── AI Platform Allowlist ─────────────────────────────────────────────────────
const AI_DOMAINS = [
    'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
    'perplexity.ai', 'www.perplexity.ai', 'copilot.microsoft.com',
    'chat.deepseek.com', 'chat.mistral.ai', 'huggingface.co', 'poe.com',
];

// Input selectors ordered from most-specific to most-general.
// ChatGPT uses a ProseMirror contenteditable div; Claude uses a similar pattern.
// Keep these updated as AI platforms evolve their UIs.
const INPUT_SELECTORS = [
    // ChatGPT (current — ProseMirror inside a contenteditable div)
    '#prompt-textarea',
    'div[contenteditable="true"][data-testid]',
    'div[contenteditable="true"][class*="ProseMirror"]',
    // Generic contenteditable
    'div[contenteditable="true"]',
    // Traditional textarea fallbacks
    'textarea#prompt-textarea',
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="Message"]',
    'textarea[data-testid="chat-input"]',
    'textarea[data-testid]',
    'div[data-placeholder]',
];

function isAIPage() {
    const h = window.location.hostname;
    return AI_DOMAINS.some(d => h === d || h.endsWith('.' + d));
}

function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('chatgpt') || h.includes('openai')) return 'ChatGPT';
    if (h.includes('claude')) return 'Claude';
    if (h.includes('gemini')) return 'Gemini';
    if (h.includes('perplexity')) return 'Perplexity';
    if (h.includes('copilot')) return 'Copilot';
    if (h.includes('deepseek')) return 'DeepSeek';
    if (h.includes('mistral')) return 'Mistral';
    return 'Unknown AI';
}

// ── DLP Preflight ─────────────────────────────────────────────────────────────
function runDLPPreflight(text) {
    const findings = [];
    let redacted = text;
    let hasCritical = false;

    for (const rule of DLP_PATTERNS) {
        const rx = new RegExp(rule.pattern.source, rule.pattern.flags);
        if (rx.test(text)) {
            findings.push({
                id: rule.id,
                label: rule.label,
                severity: rule.severity,
                action_suggestion: rule.action
            });
            if (rule.severity === 'critical') hasCritical = true;
            const ry = new RegExp(rule.pattern.source, rule.pattern.flags);
            redacted = redacted.replace(ry, rule.replacement);
        }
    }
    return { findings, redactedText: redacted, hasCritical, source: 'dlp_preflight' };
}

// ── Notify Popup via chrome.storage ──────────────────────────────────────────
function notifyLastScan(result, promptSnippet) {
    try {
        chrome.storage.local.set({
            lastScanResult: {
                action: result.action,
                findings: result.findings || [],
                message: result.message || '',
                promptSnippet: (promptSnippet || '').substring(0, 80),
                source: result.source || 'backend',
                timestamp: Date.now(),
            }
        });
    } catch (e) { /* extension context invalidated */ }
}

// ── Safe sendMessage (handles dead SW gracefully) ─────────────────────────────
function safeSendMessage(message, timeoutMs) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs || 5000);
        try {
            chrome.runtime.sendMessage(message, (res) => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) { resolve(null); return; }
                resolve(res || null);
            });
        } catch (e) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function findActiveInput() {
    for (const s of INPUT_SELECTORS) {
        const el = document.querySelector(s);
        if (el) return el;
    }
    return null;
}

function resolveInput(target) {
    if (!target) return null;
    for (const s of INPUT_SELECTORS) {
        try { if (target.matches && target.matches(s)) return target; } catch (e) { }
    }
    let el = target.parentElement;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
        for (const s of INPUT_SELECTORS) {
            try { if (el.matches && el.matches(s)) return el; } catch (e) { }
        }
    }
    return null;
}

function isSendButton(target) {
    if (!target || !target.closest) return null;
    const btn = target.closest('button, [role="button"], [aria-label*="end"], [aria-label*="ubmit"]');
    if (!btn) return null;

    // ChatGPT current UI uses data-testid="send-button"
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    if (testId === 'send-button' || testId === 'fruitjuice-send-button') return btn;

    const attrs = [btn.getAttribute('aria-label'), testId, btn.getAttribute('title')]
        .map(a => (a || '').toLowerCase());
    if (attrs.some(a => a.includes('send') || a.includes('submit') || a.includes('ask') || a.includes('message'))) return btn;

    // SVG-only buttons (icon buttons adjacent to input)
    if (btn.querySelector('svg')) {
        let p = btn.parentElement;
        for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
            if (p.querySelector(INPUT_SELECTORS.join(','))) return btn;
        }
    }
    return null;
}

function extractText(el) {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return el.value;
    if (el.isContentEditable) return el.innerText || el.textContent || '';
    return '';
}

// ── In-page Overlay UI ────────────────────────────────────────────────────────
function removeOverlay() {
    const old = document.getElementById('complyze-overlay');
    if (old) old.remove();
}

function showOverlay({ type, title, body, autoDismissMs }) {
    removeOverlay();
    const styles = {
        block: { bg: '#1a0a0a', border: '#ef4444', accent: '#f87171' },
        redact: { bg: '#0f150a', border: '#f59e0b', accent: '#fbbf24' },
        warn: { bg: '#1a180a', border: '#f59e0b', accent: '#fbbf24' },
        safe: { bg: '#0a150a', border: '#22c55e', accent: '#4ade80' },
    };
    const s = styles[type] || styles.safe;

    const el = document.createElement('div');
    el.id = 'complyze-overlay';
    el.style.cssText = [
        'position:fixed!important', 'top:20px!important', 'left:50%!important',
        'transform:translateX(-50%)!important', 'z-index:2147483647!important',
        'min-width:320px!important', 'max-width:460px!important',
        `background:${s.bg}!important`, `border:1.5px solid ${s.border}!important`,
        'border-radius:14px!important', 'padding:14px 18px!important',
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif!important",
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)!important',
        'pointer-events:auto!important', 'opacity:1!important',
        'transition:opacity 0.3s ease!important',
    ].join(';');

    el.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
                <div style="color:${s.accent};font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:${body ? '6px' : '0'}">${title}</div>
                ${body ? `<div style="color:#94a3b8;font-size:12px;line-height:1.6">${body}</div>` : ''}
            </div>
            <button id="complyze-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;line-height:1;flex-shrink:0;margin-top:1px">✕</button>
        </div>`;

    document.documentElement.appendChild(el);
    el.querySelector('#complyze-close').addEventListener('click', removeOverlay);

    if (autoDismissMs) {
        setTimeout(() => { el.style.opacity = '0'; setTimeout(removeOverlay, 300); }, autoDismissMs);
    }
}

// ── Enforcement helpers ────────────────────────────────────────────────────────
async function enforceRedaction(inputEl, redactedText) {
    if (!redactedText) return;
    const tag = inputEl.tagName.toLowerCase();

    inputEl.focus();
    if (tag === 'textarea' || tag === 'input') {
        inputEl.value = redactedText;
    } else {
        // CONTENTEDITABLE (ChatGPT/Claude/Gemini)
        // Manual innerText change often breaks React/ProseMirror state. 
        // execCommand('insertText') is the gold standard for reliable injection.
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, redactedText);
    }

    // Trigger events to sync site's internal state
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Give the site's event loop a tiny moment to process the state change 
    // before we trigger the re-submission via bypassAndSubmit
    await new Promise(r => setTimeout(r, 100));
    console.log('[Complyze] Redaction applied.');
}

function enforceBlock(inputEl, message, findings) {
    const list = (findings || []).map(f => `• ${f.label || f}`).join('<br>');
    showOverlay({
        type: 'block',
        title: '🚫 Prompt Blocked by Complyze',
        body: `<strong style="color:#fca5a5">${message || 'Sensitive data detected'}</strong>${list ? '<br><br>' + list : ''}`,
    });
    const tag = inputEl.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input') inputEl.value = '';
    else {
        inputEl.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
    }
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
}

function haltEvent(e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
}

function bypassAndSubmit(originalEvent, triggerEl) {
    triggerEl.dataset.complyzeScanned = 'true';
    console.log('[Complyze] Bypassing and submitting...')

    let cloned;
    if (originalEvent.type === 'keydown' || originalEvent instanceof KeyboardEvent) {
        cloned = new KeyboardEvent(originalEvent.type, {
            key: originalEvent.key, code: originalEvent.code,
            ctrlKey: originalEvent.ctrlKey, shiftKey: originalEvent.shiftKey,
            altKey: originalEvent.altKey, metaKey: originalEvent.metaKey,
            bubbles: true, cancelable: true, composed: true, view: window,
        });
    } else {
        cloned = new MouseEvent(originalEvent.type, {
            clientX: originalEvent.clientX, clientY: originalEvent.clientY,
            bubbles: true, cancelable: true, composed: true, view: window,
        });
    }
    (originalEvent.target || triggerEl).dispatchEvent(cloned);
    setTimeout(() => { delete triggerEl.dataset.complyzeScanned; }, 500);
}

// ── Core interception logic ────────────────────────────────────────────────────
let isScanning = false;
const AI_TOOL = detectPlatform();

async function getFeatures() {
    const res = await safeSendMessage({ type: 'GET_AUTH_STATE' }, 1000);
    if (res && res.user && res.user.features) {
        return res.user.features;
    }
    return {
        promptMonitoring: true, sensitiveDataDetection: true, riskScore: true,
        blocking: true, redaction: true, attachmentScanning: true
    };
}

async function interceptAndScan(originalEvent, inputEl, actionEl) {
    if (!isAIPage()) return;
    if (isScanning) { haltEvent(originalEvent); return; }

    const text = extractText(inputEl);
    if (!text || text.trim().length === 0) return;

    // Halt the event — WE control whether it gets submitted
    haltEvent(originalEvent);
    isScanning = true;

    const triggerEl = actionEl || inputEl;

    const features = await getFeatures();

    if (!features.promptMonitoring) {
        bypassAndSubmit(originalEvent, triggerEl);
        isScanning = false;
        return;
    }

    const snippet = text.substring(0, 80);
    let dlpResult = { findings: [], redactedText: text, hasCritical: false };

    try {
        // ── STEP 1: Client-side DLP Precheck ────────────────────────────────
        // SIGNAL ONLY — results are forwarded to the backend as context.
        // They do NOT make the final enforcement decision for configurable policy cases.
        if (features.sensitiveDataDetection) {
            dlpResult = runDLPPreflight(text);
            if (dlpResult.findings.length > 0) {
                console.log('[Complyze] Local DLP precheck — signal findings:', dlpResult.findings.length,
                    '| hasCritical:', dlpResult.hasCritical,
                    '| blocked_locally: false (signal only)');
            }
        }

        // ── STEP 2: Backend Scan & Policy Decision ───────────────────────────
        // Extension sends prompt + DLP signals → backend → Ollama → policy engine → decision.
        // The backend is the SOLE source of truth for the final action.
        console.log('[Complyze] Sending to backend for analysis...', {
            promptLength: text.length,
            dlpFindingsCount: dlpResult.findings.length,
            hasCritical: dlpResult.hasCritical,
        });

        // ── STEP 2a: Local Ollama — primary decision source ─────────────────
        // ALL enforcement decisions must originate from the LLM, never from regex.
        // Try the locally-hosted Ollama instance first (http://localhost:11434).
        console.log('[Complyze] Calling local Ollama for risk analysis...', {
            promptLength: text.length,
            dlpSignals: dlpResult.findings.length,
        });

        const ollamaResult = await callLocalOllama(text, dlpResult.findings);

        if (ollamaResult) {
            // Local Ollama responded — use its decision directly
            const backendResult = mapOllamaDecision(ollamaResult);
            const policy = backendResult.policy_decision;
            const finalAction = policy.action || 'allow';

            console.log('[Complyze] Local Ollama enforcement:', {
                action: finalAction,
                decision_source: 'local_ollama',
                model_used: true,
                riskScore: ollamaResult.risk_score,
                risk_type: ollamaResult.risk_type,
            });

            notifyLastScan({
                action: finalAction,
                findings: dlpResult.findings,
                message: policy.reason || '',
                source: 'local_ollama',
            }, snippet);

            safeSendMessage({
                type: 'LOG_ACTIVITY', payload: {
                    aiTool: AI_TOOL, promptLength: text.length,
                    riskScore: ollamaResult.risk_score,
                    action: finalAction,
                    blocked: finalAction === 'block',
                    findings: ollamaResult.risk_type,
                    promptText: text,
                    decision_source: 'local_ollama',
                    model_used: true,
                    blocked_locally: finalAction === 'block',
                    timestamp: new Date().toISOString(),
                }
            }, 2000);

            if (finalAction === 'block') {
                enforceBlock(inputEl, policy.reason || 'Blocked by local Ollama security model.', dlpResult.findings);
            } else if (finalAction === 'redact') {
                await enforceRedaction(inputEl, dlpResult.redactedText || text);
                showOverlay({
                    type: 'redact', title: '✂️ Complyze — Redacted',
                    body: `Detected: <strong style="color:#fbbf24">${ollamaResult.risk_type.join(', ')}</strong>`,
                    autoDismissMs: 5000,
                });
                bypassAndSubmit(originalEvent, triggerEl);
            } else if (finalAction === 'warn') {
                showOverlay({
                    type: 'warn', title: '⚠️ Complyze — Security Notice',
                    body: `Ollama flagged: <strong style="color:#fbbf24">${ollamaResult.risk_type.join(', ')}</strong><br>Risk score: ${ollamaResult.risk_score}/100`,
                    autoDismissMs: 4000,
                });
                bypassAndSubmit(originalEvent, triggerEl);
            } else {
                showOverlay({ type: 'safe', title: 'Complyze — Prompt Safe ✓', autoDismissMs: 2000 });
                bypassAndSubmit(originalEvent, triggerEl);
            }
            return;
        }

        // ── STEP 2b: Backend fallback (backend also routes through Ollama) ───
        // Local Ollama was unreachable — try backend which calls its own Ollama instance.
        console.log('[Complyze] Local Ollama unavailable — falling back to backend scan...', {
            promptLength: text.length,
            dlpFindingsCount: dlpResult.findings.length,
        });

        const backendResult = await safeSendMessage({
            type: 'SCAN_PROMPT',
            payload: {
                prompt: text,
                aiTool: AI_TOOL,
                context: '',
                dlpFindings: dlpResult.findings,   // DLP findings are advisory context only
                hasCritical: false,                 // Never pass hasCritical=true — regex must not drive decisions
            }
        }, 8000);

        if (!backendResult) {
            // Both local Ollama and backend unreachable.
            // Allow with warning — do NOT block based on regex alone.
            console.warn('[Complyze] Both local Ollama and backend unreachable — allowing with warning');

            notifyLastScan({ action: 'warn', findings: dlpResult.findings, source: 'offline' }, snippet);
            showOverlay({
                type: 'warn', title: '⚠️ Complyze — Analysis Unavailable',
                body: 'Security analysis is temporarily offline. Proceeding with caution — review your prompt for sensitive data.',
                autoDismissMs: 6000,
            });

            safeSendMessage({
                type: 'LOG_ACTIVITY', payload: {
                    aiTool: AI_TOOL, promptLength: text.length, riskScore: 0,
                    action: 'warn', blocked: false,
                    findings: dlpResult.findings.map(f => f.label),
                    promptText: text,
                    decision_source: 'offline_fallback',
                    model_used: false,
                    blocked_locally: false,
                    timestamp: new Date().toISOString(),
                }
            }, 2000);

            bypassAndSubmit(originalEvent, triggerEl);
            return;
        }

        // ── STEP 3: Apply authoritative backend decision ─────────────────────
        // The backend response IS the enforcement decision. Extension renders it.
        const policy = backendResult.policy_decision || { action: 'allow', reason: 'Safe', source: 'backend_policy' };
        let finalAction = policy.action || 'allow';
        const finalText = backendResult.redactedText || dlpResult.redactedText;
        let riskScore = features.riskScore ? backendResult.riskScore || 0 : undefined;

        // Debug: log the complete decision path to verify correct architecture is used
        console.log('[Complyze] Backend decision received:', {
            action: finalAction,
            decision_source: backendResult.decision_source || policy.source || 'backend_policy',
            model_used: backendResult.model_used,      // was Ollama consulted?
            policy_used: backendResult.policy_used,    // was org policy applied?
            blocked_locally: backendResult.blocked_locally ?? false,
            riskScore,
            reason: policy.reason,
        });

        // Note: We don't log locally here anymore because the backend handles its own logging
        // to ensure Dashboard consistency. Backend scanPrompt now writes to Activity log.
        // If we want the extension to log additional metadata, we can, but let's trust the backend.

        notifyLastScan({
            action: finalAction,
            findings: backendResult.analysis_result?.findings || dlpResult.findings,
            message: policy.reason || backendResult.message || '',
            source: policy.source || 'backend',
        }, snippet);

        if (finalAction === 'block') {
            enforceBlock(inputEl, backendResult.message || 'Blocked by your organization\'s AI policy.', dlpResult.findings);
        } else if (finalAction === 'redact') {
            await enforceRedaction(inputEl, finalText);
            const labels = dlpResult.findings.map(f => f.label).slice(0, 3).join(', ') || 'sensitive content';
            showOverlay({
                type: 'redact', title: '✂️ Complyze — Redacted',
                body: `Removed: <strong style="color:#fbbf24">${labels}</strong>`,
                autoDismissMs: 5000,
            });
            bypassAndSubmit(originalEvent, triggerEl);
        } else if (finalAction === 'warn') {
            const labels = dlpResult.findings.map(f => f.label).slice(0, 3).join(', ') || 'sensitive patterns';
            showOverlay({
                type: 'warn', title: '⚠️ Complyze — Security Notice',
                body: `Potential sensitive data detected: <strong style="color:#fbbf24">${labels}</strong>.<br>${backendResult.message || 'Proceeding according to organization policy.'}`,
                autoDismissMs: 4000,
            });
            bypassAndSubmit(originalEvent, triggerEl);
        } else {
            showOverlay({ type: 'safe', title: 'Complyze — Prompt Safe ✓', autoDismissMs: 2000 });
            bypassAndSubmit(originalEvent, triggerEl);
        }

    } catch (err) {
        console.error('[Complyze] Scan error:', err);
        bypassAndSubmit(originalEvent, triggerEl);
    } finally {
        isScanning = false;
    }
}

// ── Event Handlers ────────────────────────────────────────────────────────────
async function handleKeydown(event) {
    if (!isAIPage()) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    if (event.target && event.target.dataset && event.target.dataset.complyzeScanned === 'true') return;
    const inputEl = resolveInput(event.target) || findActiveInput();
    if (inputEl) await interceptAndScan(event, inputEl, null);
}

async function handleClick(event) {
    if (!isAIPage()) return;
    const sendBtn = isSendButton(event.target);
    if (!sendBtn) return;
    if (sendBtn.dataset.complyzeScanned === 'true') return;
    const inputEl = findActiveInput();
    if (inputEl) await interceptAndScan(event, inputEl, sendBtn);
}

// ── Attachment Interception ────────────────────────────────────────────────────
function initFileInterceptor() {
    document.addEventListener('change', async (e) => {
        const target = e.target;
        if (target.tagName === 'INPUT' && target.type === 'file') {
            const files = target.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                // If the input was already cleared by a previous scan in the same batch, skip
                if (target.value === '') break;
                await handleFileUpload(file, target);
            }
        }
    }, true);
}

async function handleFileUpload(file, inputEl) {
    return new Promise(async (resolve) => {
        const features = await getFeatures();
        if (!features.attachmentScanning) {
            resolve();
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            if (!content) { resolve(); return; }

            // 1. Preflight DLP on file content
            let dlp = { action: 'allow', findings: [] };
            if (features.sensitiveDataDetection) {
                dlp = runDLPPreflight(content);
            }

            // DLP regex findings are signals only — do NOT block based on regex alone.
            // Forward the findings to backend as advisory context for Ollama evaluation.

            // 2. Backend Scan for "Deep Inspection"
            const result = await safeSendMessage({
                type: 'SCAN_FILE',
                payload: {
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    content: content.substring(0, 50000), // Cap for evaluation
                    aiTool: AI_TOOL
                }
            }, 6000);

            if (result && result.action === 'block') {
                enforceFileBlock(inputEl, file.name, result.message || 'Blocked by policy');

                // Log activity
                safeSendMessage({
                    type: 'LOG_ACTIVITY', payload: {
                        aiTool: AI_TOOL, promptLength: content.length,
                        riskScore: features.riskScore ? result.riskScore || 90 : 0,
                        action: 'block', blocked: true,
                        findings: [`File: ${file.name}`, result.message || 'Sensitive Attachment'],
                        timestamp: new Date().toISOString(),
                    }
                }, 3000);
            } else if (result && result.action === 'warn') {
                showOverlay({
                    type: 'warn',
                    title: '⚠️ Attachment Warning',
                    body: `<strong style="color:#fbbf24">${file.name}</strong><br>Contains sensitive data: ${result.message}`
                });
            }
            resolve();
        };

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const textExts = ['txt', 'csv', 'log', 'json', 'md', 'py', 'js', 'ts', 'go', 'java', 'c', 'cpp', 'rs', 'html', 'css', 'sql'];

        if (textExts.includes(ext) || file.type.startsWith('text/')) {
            reader.readAsText(file.slice(0, 1024 * 1024)); // Read first 1MB
        } else if (file.type.startsWith('image/') || ext === 'pdf') {
            // For images and PDFs, send as DataURL for vision/extraction scan
            reader.readAsDataURL(file.slice(0, 2 * 1024 * 1024)); // Read first 2MB
        } else {
            // For other binary types, we can't deep scan locally yet
            resolve();
        }
    });
}

function enforceFileBlock(inputEl, fileName, message) {
    showOverlay({
        type: 'block',
        title: '🚫 Attachment Blocked',
        body: `<strong style="color:#fca5a5">${fileName}</strong><br>${message}`
    });
    inputEl.value = '';
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
}


// ── Boot ──────────────────────────────────────────────────────────────────────
if (isAIPage()) {
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('click', handleClick, true);
    initFileInterceptor();
    console.log(`[Complyze] Shield ACTIVE on ${AI_TOOL} (${window.location.hostname})`);
} else {
    // We still log for debugging why it might not open
    console.log(`[Complyze] Sidebar available on ${window.location.hostname}`);
}
