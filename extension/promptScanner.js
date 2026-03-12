/**
 * promptScanner.js — Complyze Zero-Trust Shield v1.5.0
 *
 * Content script injected into AI platform pages.
 * Intercepts prompts BEFORE they reach the AI provider.
 *
 * Enforcement pipeline:
 *  1. Prompt intercepted in-page
 *  2. Sent to backend /api/scanPrompt → Ollama VPS model → policy engine → decision
 *  3. Extension enforces the backend decision in-page
 *  4. Overlay feedback shown; lastScanResult written to storage for popup display
 *
 * ALL risk detection is performed by the Ollama model on the VPS.
 * NO regex-based detection. NO local Ollama calls. NO external LLM providers.
 * The backend is the sole decision authority.
 *
 * Debug fields in every response:
 *   model_used      — was Ollama consulted? (always true in normal flow)
 *   policy_used     — was org policy applied?
 *   decision_source — "backend_policy"
 */

'use strict';

// ── AI Platform Allowlist ─────────────────────────────────────────────────────
const AI_DOMAINS = [
    'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
    'aistudio.google.com', 'openrouter.ai',
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
    // Google AI Studio / Gemini
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="Type something" i]',
    '.ql-editor[contenteditable="true"]',
    // OpenRouter
    'textarea[placeholder*="Send a message" i]',
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
    if (h === 'aistudio.google.com') return 'Google AI Studio';
    if (h.includes('gemini')) return 'Gemini';
    if (h.includes('openrouter')) return 'OpenRouter';
    if (h.includes('perplexity')) return 'Perplexity';
    if (h.includes('copilot')) return 'Copilot';
    if (h.includes('deepseek')) return 'DeepSeek';
    if (h.includes('mistral')) return 'Mistral';
    return 'Unknown AI';
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

    try {
        // ── Send to backend for Ollama analysis + policy decision ─────────────
        // ALL risk detection is performed by the Ollama model on the VPS.
        // NO regex detection. NO local Ollama calls.
        console.log('[Complyze][INTERCEPT] Prompt intercepted on', AI_TOOL, {
            hostname: window.location.hostname,
            promptLength: text.length,
            promptSnippet: text.substring(0, 60) + (text.length > 60 ? '...' : ''),
            features: { monitoring: features.promptMonitoring, blocking: features.blocking, redaction: features.redaction, attachments: features.attachmentScanning },
        });
        console.log('[Complyze][INTERCEPT] Sending prompt to Ollama via backend...');

        const backendResult = await safeSendMessage({
            type: 'SCAN_PROMPT',
            payload: {
                prompt: text,
                aiTool: AI_TOOL,
                context: '',
            }
        }, 15000);

        if (!backendResult) {
            // Backend unreachable — allow with warning
            console.warn('[Complyze][INTERCEPT] Backend unreachable — allowing with warning');

            notifyLastScan({ action: 'warn', findings: [], source: 'offline' }, snippet);
            showOverlay({
                type: 'warn', title: '⚠️ Complyze — Analysis Unavailable',
                body: 'Security analysis is temporarily offline. Proceeding with caution — review your prompt for sensitive data.',
                autoDismissMs: 6000,
            });

            safeSendMessage({
                type: 'LOG_ACTIVITY', payload: {
                    aiTool: AI_TOOL, promptLength: text.length, riskScore: 0,
                    action: 'warn', blocked: false,
                    findings: [],
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

        // ── Apply authoritative backend decision ─────────────────────────────
        // The backend response IS the enforcement decision. Extension renders it.
        const policy = backendResult.policy_decision || { action: 'allow', reason: 'Safe', source: 'backend_policy' };
        let finalAction = policy.action || 'allow';
        const finalText = backendResult.redactedText;
        let riskScore = features.riskScore ? backendResult.riskScore || 0 : undefined;

        console.log('[Complyze][INTERCEPT] Backend response received:', {
            action: finalAction,
            decision_source: backendResult.decision_source || policy.source || 'backend_policy',
            model_used: backendResult.model_used,
            policy_used: backendResult.policy_used,
            ollama_model: backendResult.ollama_model_used || 'complyze-qwen',
            ollama_host: backendResult.ollama_host_used || 'OLLAMA_BASE_URL',
            riskScore,
            reason: policy.reason,
            findings: backendResult.analysis_result?.findings?.length || 0,
            sensitive_categories: backendResult.analysis_result?.sensitive_categories || [],
        });

        notifyLastScan({
            action: finalAction,
            findings: backendResult.analysis_result?.findings || [],
            message: policy.reason || backendResult.message || '',
            source: policy.source || 'backend',
        }, snippet);

        if (finalAction === 'block') {
            console.log('[Complyze][INTERCEPT] ENFORCING BLOCK — prompt cleared');
            const findings = (backendResult.analysis_result?.findings || []).map(f => ({ label: f.reason || f.category }));
            enforceBlock(inputEl, backendResult.message || 'Blocked by your organization\'s AI policy.', findings);
        } else if (finalAction === 'redact') {
            console.log('[Complyze][INTERCEPT] ENFORCING REDACT — replacing prompt text');
            if (finalText) {
                await enforceRedaction(inputEl, finalText);
            }
            const categories = (backendResult.analysis_result?.sensitive_categories || []).slice(0, 3).join(', ') || 'sensitive content';
            showOverlay({
                type: 'redact', title: '✂️ Complyze — Redacted',
                body: `Removed: <strong style="color:#fbbf24">${categories}</strong>`,
                autoDismissMs: 5000,
            });
            bypassAndSubmit(originalEvent, triggerEl);
        } else if (finalAction === 'warn') {
            console.log('[Complyze][INTERCEPT] WARN — allowing with notice');
            const categories = (backendResult.analysis_result?.sensitive_categories || []).slice(0, 3).join(', ') || 'sensitive patterns';
            showOverlay({
                type: 'warn', title: '⚠️ Complyze — Security Notice',
                body: `Potential sensitive data detected: <strong style="color:#fbbf24">${categories}</strong>.<br>${backendResult.message || 'Proceeding according to organization policy.'}`,
                autoDismissMs: 4000,
            });
            bypassAndSubmit(originalEvent, triggerEl);
        } else {
            console.log('[Complyze][INTERCEPT] ALLOW — prompt safe, submitting');
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

            // All risk detection is done by the Ollama model via the backend.
            // No client-side DLP/regex.

            // Backend Scan for "Deep Inspection"
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
