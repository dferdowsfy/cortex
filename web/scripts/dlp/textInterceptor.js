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

/**
 * Handles DLP evaluation for proxy-intercepted attachment uploads.
 *
 * Takes an array of attachment inspection results (from inspectAttachmentBuffer)
 * and runs REU calculation + policy evaluation, treating each file as an
 * attachment-exposure event (EM=5.0 or bulk EM=10.0).
 *
 * @param {Array<object>} attachmentResults - Results from inspectAttachmentBuffer[]
 * @param {object} metadata - { appName, destinationType }
 */
async function processAttachmentUpload(attachmentResults, metadata) {
    if (!attachmentResults || attachmentResults.length === 0) {
        return { finalReu: 0, action: 'ALLOW' };
    }

    // Aggregate across all attached files
    let totalSensitivityPoints = 0;
    const allCategories = [];
    let isBulk = false;

    for (const att of attachmentResults) {
        totalSensitivityPoints += att.sensitivityPoints || 0;
        if (att.detectedCategories) {
            allCategories.push(...att.detectedCategories);
        }
        if (att.isBulk) isBulk = true;
    }

    // Use the highest single-file sensitivity for REU (worst-case file drives policy)
    const maxSensitivityPoints = Math.max(...attachmentResults.map(a => a.sensitivityPoints || 0));
    const transmissionType = isBulk ? 'bulk' : 'attachment';

    // 1. Calculate REU using attachment multipliers (5x or 10x for bulk)
    const reuResult = calculateREU(
        maxSensitivityPoints,
        transmissionType,
        metadata.destinationType || 'unknown'
    );

    // 2. Evaluate Policy
    const policyResult = await evaluatePolicy(reuResult);

    // 3. Log Encrypted Metadata
    await logAuditEntry({
        appName: metadata.appName || 'Unknown',
        destinationType: metadata.destinationType || 'unknown',
        detectedCategories: [...new Set(allCategories)],
        sensitivityPoints: totalSensitivityPoints,
        ...reuResult
    });

    return {
        ...reuResult,
        ...policyResult,
        detectedCategories: [...new Set(allCategories)],
        totalSensitivityPoints
    };
}

module.exports = { processOutgoingPrompt, processAttachmentUpload };
