/**
 * attachmentInspector.js
 * 
 * Extracts text from common file types locally.
 * No files are stored or uploaded.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { parse } = require('csv-parse/sync');
const { scanText } = require('./deterministicScanner');

/**
 * Inspects a file for sensitive patterns
 */
async function inspectAttachment(filePath) {
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Generate SHA-256 hash
    const fileBuffer = fs.readFileSync(filePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    let extractedText = "";

    try {
        if (fileExtension === '.pdf') {
            const data = await pdf(fileBuffer);
            extractedText = data.text;
        } else if (fileExtension === '.docx') {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText = result.value;
        } else if (fileExtension === '.csv') {
            const records = parse(fileBuffer, { skip_empty_lines: true });
            extractedText = records.map(row => row.join(' ')).join('\n');
        } else {
            // Treat as plain text
            extractedText = fileBuffer.toString('utf8');
        }
    } catch (err) {
        console.error(`[DLP] Failed to extract text from ${fileName}:`, err.message);
    }

    const { detectedCategories, sensitivityPoints } = scanText(extractedText);
    const isBulk = extractedText.length > 5000;

    // Immediately clear extracted text from memory
    extractedText = null;

    return {
        fileHash,
        fileType: fileExtension,
        fileSize,
        detectedCategories,
        sensitivityPoints,
        isBulk
    };
}

module.exports = { inspectAttachment };
