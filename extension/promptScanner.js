class PromptScanner {
    constructor(policyClient, config = {}) {
        this.policyClient = policyClient;
        // Apply enterprise defaults: 5000ms timeout, fail-closed by default for maximum security.
        this.config = {
            timeoutMs: config.timeoutMs || 5000,
            failClosed: config.failClosed !== undefined ? config.failClosed : true
        };
        this.aiTool = this.detectPlatform();
        this.isScanning = false;

        // Selectors optimized for modern AI SPAs
        this.inputSelectors = [
            'textarea#prompt-textarea',           // ChatGPT
            'div[contenteditable="true"]',        // Claude / Gemini / General Rich Text
            'textarea[placeholder*="Ask"]',       // Perplexity
            'textarea[data-testid="chat-input"]'  // Generic Fallback
        ];

        // Bind instance methods to maintain `this` context for event handlers
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleClick = this.handleClick.bind(this);

        this.init();
    }

    init() {
        // Utilize highly resilient event delegation on the capture phase.
        // By intercepting at the `window` level before it bubbles down, we bypass complex SPA 
        // event overriding (e.g., React's SyntheticEvent root listeners).
        window.addEventListener('keydown', this.handleKeydown, true);
        window.addEventListener('click', this.handleClick, true);
        console.log(`[Complyze] PromptScanner initialized natively for ${this.aiTool}`);
    }

    destroy() {
        // Memory leak prevention: ensure all global listeners are unbound
        window.removeEventListener('keydown', this.handleKeydown, true);
        window.removeEventListener('click', this.handleClick, true);
        console.log(`[Complyze] PromptScanner successfully detached.`);
    }

    detectPlatform() {
        const host = window.location.hostname;
        if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'ChatGPT';
        if (host.includes('claude.ai')) return 'Claude';
        if (host.includes('gemini.google.com')) return 'Gemini';
        if (host.includes('perplexity.ai')) return 'Perplexity';
        return 'Unknown';
    }

    findActiveInput() {
        for (let selector of this.inputSelectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    isRecognizedInput(target) {
        if (!target) return false;
        // Check the target itself first
        for (let selector of this.inputSelectors) {
            try {
                if (target.matches && target.matches(selector)) return true;
            } catch (e) { }
        }
        // CRITICAL FIX: ChatGPT types into a <p> inside a contenteditable div.
        // Walk up the DOM to find if any ancestor is a recognized input.
        let el = target.parentElement;
        let depth = 0;
        while (el && depth < 6) {
            for (let selector of this.inputSelectors) {
                try {
                    if (el.matches && el.matches(selector)) {
                        console.log('[Complyze] Found recognized input via ancestor:', selector, el);
                        return true;
                    }
                } catch (e) { }
            }
            el = el.parentElement;
            depth++;
        }
        return false;
    }

    // Returns the actual recognized input element (walks up ancestors)
    resolveInput(target) {
        if (!target) return null;
        for (let selector of this.inputSelectors) {
            try { if (target.matches && target.matches(selector)) return target; } catch (e) { }
        }
        let el = target.parentElement;
        let depth = 0;
        while (el && depth < 6) {
            for (let selector of this.inputSelectors) {
                try { if (el.matches && el.matches(selector)) return el; } catch (e) { }
            }
            el = el.parentElement;
            depth++;
        }
        return null;
    }

    isSendButton(target) {
        if (!target || !target.closest) return false;

        // Find closest parent that represents a button/action element
        const btn = target.closest('button, [role="button"], [aria-label*="end"], [aria-label*="ubmit"]');
        if (!btn) return false;

        // 1. Direct heuristics based on element attributes
        const attrs = [
            btn.getAttribute('aria-label'),
            btn.getAttribute('data-testid'),
            btn.getAttribute('title')
        ].map(a => (a || '').toLowerCase());

        const isSendAction = attrs.some(a =>
            a.includes('send') ||
            a.includes('submit') ||
            a.includes('ask') ||
            a.includes('message')
        );

        if (isSendAction) return btn;

        // 2. Structural heuristics for icon buttons lacking distinct labels (Edge-case fallback)
        const svg = btn.querySelector('svg');
        if (svg) {
            // Traverse up to 5 levels to verify if the button is adjacent to our text input
            let parent = btn.parentElement;
            let levels = 0;
            while (parent && levels < 5) {
                if (parent.querySelector(this.inputSelectors.join(', '))) {
                    return btn;
                }
                parent = parent.parentElement;
                levels++;
            }
        }

        return null;
    }

    extractText(element) {
        if (!element) return "";

        const tag = element.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input') {
            return element.value;
        } else if (element.isContentEditable) {
            // ContentEditable may have multiple breaks or empty paragraphs
            return element.innerText || element.textContent;
        }
        return "";
    }

    extractContext() {
        const context = [];

        // Retrieve conversational DOM nodes (e.g., standard AI chat containers)
        const chatNodes = document.querySelectorAll(
            '[data-message-author-role], .message, .chat-message, [class*="message"], article'
        );

        if (chatNodes.length > 0) {
            // Scrape the last 3 visible messages, truncating for bounds
            const recent = Array.from(chatNodes)
                .slice(-3)
                .map(el => el.innerText || el.textContent)
                .filter(text => text && text.trim().length > 0)
                .map(text => text.trim().substring(0, 500));

            context.push(...recent);
        }

        return context.join('\n---\n');
    }

    showBlockedUI(message) {
        // Automatically cleanup old overlays
        const existing = document.getElementById('complyze-block-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'complyze-block-overlay';

        // Aggressive styling overrides using !important to combat SPA default resetting
        overlay.style.cssText = `
      position: fixed !important; top: 20px !important; left: 50% !important; transform: translateX(-50%) !important;
      background: #ef4444 !important; color: white !important; padding: 16px 24px !important;
      border-radius: 8px !important; font-family: ui-sans-serif, system-ui, sans-serif !important; font-weight: bold !important;
      font-size: 16px !important; line-height: 1.5 !important;
      z-index: 2147483647 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      display: flex !important; align-items: center !important; gap: 12px !important;
      pointer-events: none !important; opacity: 1 !important; transition: opacity 0.3s ease !important;
    `;
        overlay.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <span>${message || "Sensitive data detected. This prompt violates company AI policy."}</span>
    `;

        // Attach to HTML documentElement to ensure highest z-index rendering scope
        document.documentElement.appendChild(overlay);

        // Auto-dismiss cleanly
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        }, 5000);
    }

    async handleKeydown(event) {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;

        // Resolve the actual input element (may be a child of contenteditable)
        const resolvedInput = this.resolveInput(event.target) || this.findActiveInput();

        if (resolvedInput) {
            console.log('[Complyze] Keydown intercepted on:', resolvedInput.tagName, resolvedInput.id || resolvedInput.className.slice(0, 30));
            if (resolvedInput.dataset && resolvedInput.dataset.complyzeScanned === 'true') return;
            await this.interceptAndScan(event, resolvedInput);
        }
    }

    async handleClick(event) {
        const sendBtn = this.isSendButton(event.target);
        if (sendBtn) {
            if (sendBtn.dataset.complyzeScanned === "true") return;

            const inputElement = this.findActiveInput();
            if (inputElement) {
                await this.interceptAndScan(event, inputElement, sendBtn);
            }
        }
    }

    async interceptAndScan(originalEvent, inputElement, actionElement = null) {
        // If a scan is currently running, block rapid-fire duplicate submissions
        if (this.isScanning) {
            this.haltEventPropagation(originalEvent);
            return;
        }

        const text = this.extractText(inputElement);
        if (!text || text.trim().length === 0) {
            console.log('[Complyze] Empty input, skipping scan.');
            return;
        }

        console.log('[Complyze] Intercepting prompt, length:', text.length, 'tool:', this.aiTool);
        const context = this.extractContext();

        // Block original event payload from reaching the target application logic
        this.haltEventPropagation(originalEvent);
        this.isScanning = true;

        // Network Resiliency / Handling Timeouts gracefully
        const scanPromise = this.policyClient.scanWithBackend(text, this.aiTool, context);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Backend scan timeout')), this.config.timeoutMs);
        });

        try {
            const result = await Promise.race([scanPromise, timeoutPromise]);
            console.log('[Complyze] Scan result:', JSON.stringify(result));

            // Attempt telemetry logging asynchronously
            this.policyClient.logActivity({
                aiTool: this.aiTool,
                promptLength: text.length,
                riskScore: result.riskScore || 0,
                blocked: result.action === 'block',
                timestamp: new Date().toISOString()
            }).catch(err => console.error("[Complyze] Failed to log telemetry:", err));

            if (result.action === 'block') {
                this.enforceBlock(inputElement, result.message);
            } else if (result.action === 'redact') {
                this.enforceRedaction(inputElement, result.redactedText);
                this.bypassInterceptionAndSubmit(originalEvent, actionElement || inputElement);
            } else {
                this.bypassInterceptionAndSubmit(originalEvent, actionElement || inputElement);
            }
        } catch (error) {
            console.error("[Complyze] Policy evaluation failed or timed out:", error);

            // Determine fail-state based on strict enterprise configuration
            if (this.config.failClosed) {
                const timeoutMsg = error.message.includes('timeout')
                    ? "Scanner timeout. Defaulting to block (Fail-Closed)."
                    : "Compliance scanner unavailable. Defaulting to block.";
                this.enforceBlock(inputElement, timeoutMsg);
            } else {
                console.warn("[Complyze] Fail-Open policy enforced. Bypassing interceptor due to scan failure.");
                this.bypassInterceptionAndSubmit(originalEvent, actionElement || inputElement);
            }
        } finally {
            this.isScanning = false;
        }
    }

    haltEventPropagation(originalEvent) {
        originalEvent.preventDefault();
        originalEvent.stopPropagation();
        originalEvent.stopImmediatePropagation();
    }

    enforceBlock(inputElement, message) {
        this.showBlockedUI(message);

        // Nullify out the element's actual text content entirely
        const tag = inputElement.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input') {
            inputElement.value = '';
        } else {
            inputElement.innerText = '';
        }

        // Re-dispatch 'input' and 'change' events to force React/Vue SPA states to detect the cleared input box
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    }

    enforceRedaction(inputElement, redactedText) {
        if (!redactedText) return;

        const tag = inputElement.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input') {
            inputElement.value = redactedText;
        } else {
            inputElement.innerText = redactedText;
        }

        // Fire native SPA sync events identical to block deletion
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Complyze] Enforced prompt redaction on the client.");
    }

    bypassInterceptionAndSubmit(originalEvent, triggerElement) {
        // 1. Temporarily mark the element to avoid cyclic interception 
        triggerElement.dataset.complyzeScanned = "true";

        // 2. Exact cloning of original event properties to simulate natively authorized submission
        let clonedEvent;
        if (originalEvent.constructor.name === 'KeyboardEvent' || originalEvent.type === 'keydown') {
            clonedEvent = new KeyboardEvent(originalEvent.type, {
                key: originalEvent.key,
                code: originalEvent.code,
                location: originalEvent.location,
                ctrlKey: originalEvent.ctrlKey,
                shiftKey: originalEvent.shiftKey,
                altKey: originalEvent.altKey,
                metaKey: originalEvent.metaKey,
                repeat: originalEvent.repeat,
                isComposing: originalEvent.isComposing,
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window
            });
        } else if (originalEvent.constructor.name === 'MouseEvent' || originalEvent.type.includes('click')) {
            clonedEvent = new MouseEvent(originalEvent.type, {
                clientX: originalEvent.clientX,
                clientY: originalEvent.clientY,
                screenX: originalEvent.screenX,
                screenY: originalEvent.screenY,
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window
            });
        } else {
            // Fallback for edge case events
            clonedEvent = new Event(originalEvent.type, {
                bubbles: true,
                cancelable: true,
                composed: true
            });
        }

        // 3. Complete native playback routing
        originalEvent.target.dispatchEvent(clonedEvent);

        // 4. Cleanup dataset flag quickly to permit subsequent scanning on their next prompt
        setTimeout(() => {
            delete triggerElement.dataset.complyzeScanned;
        }, 150);
    }
}

// Map safely to the global namespace for Content Script lifecycle integration
window.ComplyzePromptScanner = PromptScanner;

// Initialize automatically in managed extension environments
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const defaultPolicyClient = {
        scanWithBackend: async (text, aiTool, context) => {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { type: 'SCAN_PROMPT', payload: { prompt: text, aiTool, context } },
                    (res) => resolve(res)
                );
            });
        },
        logActivity: async (eventData) => {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { type: 'LOG_ACTIVITY', payload: eventData },
                    (res) => resolve(res)
                );
            });
        }
    };
    new PromptScanner(defaultPolicyClient);
}
