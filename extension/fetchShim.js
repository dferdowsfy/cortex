/**
 * fetchShim.js — Complyze MAIN-world fetch interceptor
 *
 * This script runs in the PAGE's MAIN world (not the isolated content-script world)
 * so it can monkey-patch window.fetch directly. It detects outgoing AI API calls
 * (Gemini, OpenAI, Anthropic, etc.) and posts a message to the content script
 * (promptScanner.js) which then scans the prompt and logs/enforces policy.
 *
 * Because this is declared in the manifest with "world": "MAIN", Chrome injects
 * it directly into the page context — bypassing CSP restrictions that would block
 * inline <script> injection.
 */
'use strict';
(function () {
    if (window.__complyze_fetch_patched) return;
    window.__complyze_fetch_patched = true;

    const _origFetch = window.fetch;

    window.fetch = function () {
        var url = (typeof arguments[0] === 'string') ? arguments[0]
            : (arguments[0] && arguments[0].url) ? arguments[0].url : '';
        var opts = arguments[1] || {};
        var bodyStr = '';
        try { bodyStr = typeof opts.body === 'string' ? opts.body : ''; } catch (e) { }

        // Detect generative-AI API calls (Google, OpenAI, Anthropic patterns)
        if (bodyStr.length > 20 &&
            (url.includes('/v1beta/') || url.includes('/v1/') ||
                url.includes(':generateContent') || url.includes(':streamGenerateContent') ||
                url.includes('/chat/completions') || url.includes('/generate'))) {
            window.postMessage({
                type: '__COMPLYZE_FETCH__',
                url: url,
                body: bodyStr.substring(0, 12000)
            }, '*');
        }
        return _origFetch.apply(this, arguments);
    };
})();
