/**
 * encryptedLedger.js
 * 
 * Secure asynchronous logging of risk metadata.
 * Uses AES-256 with a locally derived key.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const LOG_FILE = path.join(process.cwd(), 'risk_audit.ledger');
const SALT_FILE = path.join(process.cwd(), '.ledger_salt');

// Ensure a salt exists for PBKDF2
if (!fs.existsSync(SALT_FILE)) {
    fs.writeFileSync(SALT_FILE, crypto.randomBytes(16).toString('hex'));
}
const SALT = Buffer.from(fs.readFileSync(SALT_FILE, 'utf8'), 'hex');

/**
 * Derives a key from a local secret (device-specific ideally)
 */
function deriveKey() {
    // In a production app, this would use a key from the system keychain
    const secret = 'complyze-local-security-key-2026';
    return crypto.pbkdf2Sync(secret, SALT, 100000, 32, 'sha256');
}

const KEY = deriveKey();

/**
 * Encrypts a string using AES-256-GCM
 */
function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Logs an entry to the encrypted ledger
 */
async function logAuditEntry(entry) {
    const auditData = {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        ...entry
    };

    const row = encrypt(JSON.stringify(auditData));
    fs.appendFileSync(LOG_FILE, row + '\n');
    console.log(`[DLP] Encrypted risk metadata logged: ${auditData.eventId} (REU: ${entry.finalReu})`);
}

module.exports = { logAuditEntry };
