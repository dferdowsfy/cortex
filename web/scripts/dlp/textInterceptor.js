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
async function processOutgoingPrompt(text, metadata) {
    // 1. Scan text (Deterministic & Local)
    const scanResult = scanText(text);

    // 2. Calculate REU
    const reuResult = calculateREU(
        scanResult.sensitivityPoints,
        scanResult.sensitivityPoints > 100 ? 'bulk' : 'text_only',
        metadata.destinationType || 'unknown'
    );

    // 3. Evaluate Policy
    const policyResult = await evaluatePolicy(reuResult);

    // 4. Log Encrypted Metadata (No Raw Text)
    await logAuditEntry({
        appName: metadata.appName || 'Unknown',
        destinationType: metadata.destinationType || 'unknown',
        ...scanResult,
        ...reuResult
    });

    return {
        ...reuResult,
        ...policyResult
    };
}

module.exports = { processOutgoingPrompt };
