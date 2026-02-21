/**
 * policyEngine.js
 *
 * Local policy evaluation and enforcement.
 * Environment-agnostic (Node or Electron).
 *
 * Enforcement modes:
 *   monitor → allow request, log event
 *   warn    → flag for warning, allow override
 *   redact  → sanitize sensitive content and forward
 *   block   → prevent request entirely
 */

let config = {
    reuThreshold: 50,
    blockingEnabled: false,
    enforcementMode: 'monitor', // 'monitor' | 'warn' | 'redact' | 'block'
    localOnlyMode: true
};

const VALID_MODES = ['monitor', 'warn', 'redact', 'block'];

/**
 * Updates the local policy configuration.
 * Accepts enforcementMode directly. Also supports legacy blockingEnabled
 * for backward compatibility — if enforcementMode is not explicitly set,
 * blockingEnabled=true maps to 'block'.
 */
function updatePolicy(newConfig) {
    config = { ...config, ...newConfig };

    // Legacy compat: derive enforcementMode from blockingEnabled when not set explicitly
    if (!newConfig.enforcementMode && newConfig.blockingEnabled !== undefined) {
        config.enforcementMode = newConfig.blockingEnabled ? 'block' : 'monitor';
    }

    // Guard against invalid mode values
    if (!VALID_MODES.includes(config.enforcementMode)) {
        config.enforcementMode = 'monitor';
    }

    console.log('[DLP] Policy updated:', config);
}

/**
 * Evaluates risk against the active enforcement mode.
 *
 * Returns { action, reason } where action is one of:
 *   'ALLOW'   — no sensitive content detected (below threshold)
 *   'MONITOR' — sensitive content detected, mode is monitor (log only)
 *   'WARN'    — sensitive content detected, mode is warn
 *   'REDACT'  — sensitive content detected, mode is redact
 *   'BLOCK'   — sensitive content detected, mode is block
 */
async function evaluatePolicy(reuResult) {
    if (reuResult.finalReu < config.reuThreshold) {
        return { action: 'ALLOW', reason: 'Below risk threshold' };
    }

    const mode = config.enforcementMode || 'monitor';

    switch (mode) {
        case 'block':
            return { action: 'BLOCK', reason: 'REU threshold exceeded — blocking per policy' };
        case 'redact':
            return { action: 'REDACT', reason: 'REU threshold exceeded — redacting sensitive content' };
        case 'warn':
            return { action: 'WARN', reason: 'High risk exposure detected — warning issued' };
        case 'monitor':
        default:
            return { action: 'MONITOR', reason: 'High risk exposure detected — logged (monitor mode)' };
    }
}

module.exports = { updatePolicy, evaluatePolicy, getConfig: () => config };
