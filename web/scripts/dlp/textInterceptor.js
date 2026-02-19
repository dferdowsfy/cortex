/**
 * textInterceptor.js
 * 
 * Main integration point for DLP scanning.
 */

const { scanText } = require('./deterministicScanner');
const { calculateREU } = require('./reuCalculator');
const { logAuditEntry } = require('./encryptedLedger');
const { evaluatePolicy, getConfig } = require('./policyEngine');

/**
 * Handles an outgoing prompt interception
 */
async function processOutgoingPrompt(text, metadata = {}) {
    try {
        if (typeof text !== 'string') {
            return { action: 'PASS', reason: 'invalid_input' };
        }

        // 1. Scan text (Deterministic & Local)
        const scanResult = scanText(text);

        // 2. Calculate REU
        const reuResult = calculateREU(
            scanResult.sensitivityPoints || 0,
            (scanResult.sensitivityPoints || 0) > 100 ? 'bulk' : 'text_only',
            metadata.destinationType || 'unknown'
        );

        // 3. Evaluate Policy
        const policyResult = await evaluatePolicy(reuResult);

        // 4. Log Encrypted Metadata (No Raw Text)
        try {
            await logAuditEntry({
                appName: metadata.appName || 'Unknown',
                destinationType: metadata.destinationType || 'unknown',
                ...(scanResult || {}),
                ...(reuResult || {})
            });
        } catch (auditErr) {
            console.error('[DLP] Audit logging failed:', auditErr.message);
        }

        return {
            ...reuResult,
            ...policyResult
        };
    } catch (err) {
        console.error('[DLP] processOutgoingPrompt error:', err.message);
        // Fail-open enforcement
        return {
            action: 'PASS',
            reason: 'internal_error',
            error: err.message
        };
    }
}

module.exports = { processOutgoingPrompt };
