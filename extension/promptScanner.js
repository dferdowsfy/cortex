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
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="Start typing" i]',
    'textarea[placeholder*="Type here" i]',
    '.ql-editor[contenteditable="true"]',
    'ms-autosize-textarea textarea',
    'ms-text-input textarea',
    '.chat-input textarea',
    '.prompt-input textarea',
    '[data-test-id="chat-input"] textarea',
    'mat-form-field textarea',
    '.mdc-text-field textarea',
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
                aiTool: result.aiTool || AI_TOOL,
                timestamp: Date.now(),
            }
        });
    } catch (e) { /* extension context invalidated */ }
}

function logPromptActivity(promptText, backendResult, finalAction, features, extra) {
    try {
        safeSendMessage({
            type: 'LOG_ACTIVITY',
            payload: Object.assign({
                aiTool: AI_TOOL,
                promptLength: (promptText || '').length,
                riskScore: features?.riskScore ? (backendResult?.riskScore || 0) : 0,
                action: finalAction || 'allow',
                blocked: finalAction === 'block',
                findings: backendResult?.analysis_result?.findings || [],
                promptText: promptText || '',
                message: backendResult?.message || backendResult?.policy_decision?.reason || '',
                decision_source: backendResult?.decision_source || backendResult?.policy_decision?.source || 'backend_policy',
                model_used: backendResult?.model_used ?? true,
                policy_used: backendResult?.policy_used ?? true,
                blocked_locally: false,
                analysis_score: backendResult?.analysis_score ?? backendResult?.riskScore ?? 0,
                timestamp: new Date().toISOString(),
            }, extra || {}),
        }, 3000);
    } catch (_) {}
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
    // Fallback: if the currently focused element is a textarea or contenteditable, use it.
    // This covers AI platforms (e.g. Google AI Studio) whose inputs don't match
    // the explicit selectors above.
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return active;
    }
    // Shadow DOM fallback: walk into the shadow root of the active element
    if (active && active.shadowRoot) {
        const inner = active.shadowRoot.querySelector('textarea, [contenteditable="true"]');
        if (inner) return inner;
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
    // Fallback: if the target itself is a textarea or contenteditable, accept it
    // even when no explicit selector matched (covers AI Studio & new platforms).
    if (target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return target;
    }
    return null;
}

function looksLikeSubmitAction(el) {
    if (!el) return false;
    const attrs = [
        el.getAttribute && el.getAttribute('aria-label'),
        el.getAttribute && el.getAttribute('title'),
        el.getAttribute && el.getAttribute('data-testid'),
        el.getAttribute && el.getAttribute('data-test-id'),
    ].map(a => (a || '').toLowerCase());
    const text = ((el.innerText || el.textContent || '') + '').trim().toLowerCase();
    if (attrs.some(a => a.includes('send') || a.includes('submit') || a.includes('ask') || a.includes('message') || a.includes('run') || a.includes('generate'))) {
        return true;
    }
    if (!text) return false;
    return /^(run|send|submit|ask|generate|go)$/.test(text) ||
        text.startsWith('run ') ||
        text.startsWith('send ') ||
        text.startsWith('generate ');
}

function isInteractiveAction(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' ||
        el.hasAttribute('tabindex') || el.hasAttribute('aria-label') ||
        el.hasAttribute('jsaction') || el.hasAttribute('data-testid');
}

function isSendButton(target) {
    if (!target) return null;

    const candidates = [];
    if (target.closest) {
        const direct = target.closest('button, [role="button"], [aria-label], [tabindex], [jsaction], [data-testid]');
        if (direct) candidates.push(direct);
    }

    let el = target;
    for (let i = 0; i < 7 && el; i++, el = el.parentElement) {
        if (candidates.indexOf(el) === -1) candidates.push(el);
    }

    for (const candidate of candidates) {
        if (!candidate) continue;

        // ChatGPT current UI uses data-testid="send-button"
        const testId = (candidate.getAttribute && candidate.getAttribute('data-testid') || '').toLowerCase();
        if (testId === 'send-button' || testId === 'fruitjuice-send-button') return candidate;

        if (isInteractiveAction(candidate) && looksLikeSubmitAction(candidate)) return candidate;

        // SVG-only buttons (icon buttons adjacent to input)
        if (candidate.querySelector && candidate.querySelector('svg') && isInteractiveAction(candidate)) {
            let p = candidate.parentElement;
            for (let j = 0; j < 5 && p; j++, p = p.parentElement) {
                if (p.querySelector && p.querySelector(INPUT_SELECTORS.join(','))) return candidate;
            }
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
            aiTool: AI_TOOL,
        }, snippet);

        logPromptActivity(text, backendResult, finalAction, features, {
            policy_used: backendResult.policy_used ?? true,
        });

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
    // Accept Enter (most platforms) or Ctrl/Cmd+Enter (some platforms like AI Studio playground)
    const isEnter = event.key === 'Enter' && !event.shiftKey && !event.isComposing;
    const isCtrlEnter = event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing;
    if (!isEnter && !isCtrlEnter) return;
    // Use composedPath to see through shadow DOM boundaries
    const realTarget = (event.composedPath && event.composedPath().length) ? event.composedPath()[0] : event.target;
    if (realTarget && realTarget.dataset && realTarget.dataset.complyzeScanned === 'true') return;
    const inputEl = resolveInput(realTarget) || findActiveInput();
    if (inputEl) {
        console.log('[Complyze][KEYDOWN] Intercepted Enter on', AI_TOOL, { tag: inputEl.tagName, id: inputEl.id });
        await interceptAndScan(event, inputEl, null);
    } else {
        console.warn('[Complyze][KEYDOWN] Enter pressed but no input element found', {
            targetTag: realTarget?.tagName, targetId: realTarget?.id,
            activeTag: document.activeElement?.tagName,
        });
    }
}

async function handleClick(event) {
    if (!isAIPage()) return;
    const realTarget = (event.composedPath && event.composedPath().length) ? event.composedPath()[0] : event.target;
    const sendBtn = isSendButton(realTarget);
    if (!sendBtn) return;
    if (sendBtn.dataset.complyzeScanned === 'true') return;
    const inputEl = findActiveInput();
    if (inputEl) {
        console.log('[Complyze][CLICK] Intercepted send button on', AI_TOOL, { tag: inputEl.tagName, btnLabel: sendBtn.getAttribute('aria-label') || sendBtn.textContent?.substring(0, 20) });
        await interceptAndScan(event, inputEl, sendBtn);
    }
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


// ── Submit-via-fetch interception (MAIN world) ──────────────────────────────
// Google AI Studio and other SPAs submit prompts via fetch(), not via form
// submissions or simple Enter/click actions that propagate standard DOM events.
// We inject a tiny shim into the PAGE world (not the content-script isolated
// world) that monkey-patches window.fetch so we can see every outgoing request.
// When the shim detects an AI-API call it posts a message to the content script
// which then scans the prompt before allowing the request to proceed.
let _fetchInterceptorReady = false;

function injectFetchInterceptor() {
    if (_fetchInterceptorReady) return;
    _fetchInterceptorReady = true;

    const script = document.createElement('script');
    script.dataset.complyze = 'fetch-shim';
    script.textContent = `(function(){
        if(window.__complyze_fetch_patched) return;
        window.__complyze_fetch_patched = true;
        const _origFetch = window.fetch;
        window.fetch = function(){
            var url = (typeof arguments[0] === 'string') ? arguments[0]
                    : (arguments[0] && arguments[0].url) ? arguments[0].url : '';
            var opts = arguments[1] || {};
            var bodyStr = '';
            try { bodyStr = typeof opts.body === 'string' ? opts.body : ''; } catch(e){}
            // Detect generative-AI API calls (Google, OpenAI, Anthropic patterns)
            if(bodyStr.length > 20 &&
               (url.includes('/v1beta/') || url.includes('/v1/') ||
                url.includes(':generateContent') || url.includes(':streamGenerateContent') ||
                url.includes('/chat/completions') || url.includes('/generate'))) {
                window.postMessage({type:'__COMPLYZE_FETCH__', url:url, body:bodyStr.substring(0,12000)}, '*');
            }
            return _origFetch.apply(this, arguments);
        };
    })();`;
    // Append then remove — the code is already evaluated.
    (document.head || document.documentElement).appendChild(script);
    try { script.remove(); } catch (_) {}
}

function handleFetchMessage(event) {
    if (event.source !== window || !event.data || event.data.type !== '__COMPLYZE_FETCH__') return;
    if (isScanning) return;
    try {
        const parsed = JSON.parse(event.data.body);
        // Extract prompt text from various API formats
        let promptText = '';
        if (parsed.contents) {
            // Google Gemini / AI Studio format
            const parts = parsed.contents.flatMap(c => (c.parts || []).map(p => p.text || ''));
            promptText = parts.join('\n');
        } else if (parsed.messages) {
            // OpenAI-compatible format
            promptText = parsed.messages.map(m => m.content || '').join('\n');
        } else if (parsed.prompt) {
            promptText = typeof parsed.prompt === 'string' ? parsed.prompt : JSON.stringify(parsed.prompt);
        }
        if (!promptText || promptText.trim().length === 0) return;

        console.log('[Complyze][FETCH-INTERCEPT] Detected AI API call:', {
            url: event.data.url.substring(0, 120),
            promptLength: promptText.length,
        });

        // We can't block the fetch (it already fired) but we CAN scan and log.
        // If the policy says block, show a warning and log the violation.
        isScanning = true;
        safeSendMessage({
            type: 'SCAN_PROMPT',
            payload: { prompt: promptText, aiTool: AI_TOOL, context: 'fetch_intercept' }
        }, 15000).then(backendResult => {
            if (!backendResult) return;
            const policy = backendResult.policy_decision || { action: 'allow' };
            const snippet = promptText.substring(0, 80);
            notifyLastScan({ action: policy.action, findings: backendResult.analysis_result?.findings || [], message: policy.reason || '', source: policy.source || 'backend', aiTool: AI_TOOL }, snippet);

            if (policy.action === 'block') {
                showOverlay({ type: 'block', title: '\uD83D\uDEAB Prompt Blocked by Complyze',
                    body: `<strong style="color:#fca5a5">${backendResult.message || 'Blocked by policy'}</strong><br><em style="color:#94a3b8">The prompt was sent before interception. This event has been logged.</em>` });
            } else if (policy.action === 'warn') {
                showOverlay({ type: 'warn', title: '\u26A0\uFE0F Complyze — Security Notice',
                    body: backendResult.message || 'Potential sensitive data detected.', autoDismissMs: 5000 });
            } else if (policy.action === 'redact') {
                showOverlay({ type: 'redact', title: '\u2702\uFE0F Complyze — Sensitive Data Detected',
                    body: 'Auto-redaction could not be applied (prompt already sent). Event logged.', autoDismissMs: 5000 });
            }
            // Log activity
            logPromptActivity(promptText, backendResult, policy.action, { riskScore: true }, {
                blocked: policy.action === 'block',
            });
        }).finally(() => { isScanning = false; });
    } catch (e) {
        console.warn('[Complyze][FETCH-INTERCEPT] Parse error:', e.message);
    }
}

// ── MutationObserver: watch for dynamically loaded inputs ─────────────────────
// Some SPAs (AI Studio, etc.) dynamically load chat UI after the initial page
// render. We periodically check for inputs to ensure interception is possible.
let _lastKnownInput = null;

function watchForInputs() {
    const check = () => {
        const el = findActiveInput();
        if (el && el !== _lastKnownInput) {
            _lastKnownInput = el;
            console.log('[Complyze][WATCH] New input element found:', {
                tag: el.tagName, id: el.id, class: el.className?.substring?.(0, 60),
                placeholder: el.placeholder?.substring?.(0, 40) || '',
            });
        }
    };
    // Run immediately, then every 2 seconds
    check();
    setInterval(check, 2000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
if (isAIPage()) {
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('click', handleClick, true);
    initFileInterceptor();

    // MAIN world fetch interception — catches AI API calls that bypass DOM events
    injectFetchInterceptor();
    window.addEventListener('message', handleFetchMessage);

    // Periodically check for dynamically loaded input elements
    watchForInputs();

    console.log('[Complyze] Shield ACTIVE on', AI_TOOL, '(' + window.location.hostname + ')', {
        selectors: INPUT_SELECTORS.length,
        inputFound: !!findActiveInput(),
    });
} else {
    console.log(`[Complyze] Sidebar available on ${window.location.hostname}`);
}
