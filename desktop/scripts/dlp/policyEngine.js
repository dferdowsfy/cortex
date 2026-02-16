/**
 * policyEngine.js
 * 
 * Local policy evaluation and enforcement.
 * Environment-agnostic (Node or Electron).
 */

let config = {
    reuThreshold: 50,
    blockingEnabled: false,
    localOnlyMode: true
};

/**
 * Updates the local policy configuration
 */
function updatePolicy(newConfig) {
    config = { ...config, ...newConfig };
    console.log('[DLP] Policy updated:', config);
}

/**
 * Evaluates risk against localized policies
 */
async function evaluatePolicy(reuResult) {
    if (reuResult.finalReu >= config.reuThreshold) {
        if (config.blockingEnabled) {
            return { action: 'BLOCK', reason: 'REU threshold exceeded' };
        } else {
            return { action: 'WARN', reason: 'High risk exposure detected' };
        }
    }
    return { action: 'ALLOW' };
}

module.exports = { updatePolicy, evaluatePolicy, getConfig: () => config };
