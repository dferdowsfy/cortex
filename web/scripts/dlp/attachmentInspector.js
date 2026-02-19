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
    let extractedText = "";
    let fileName = "unknown";
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        fileName = path.basename(filePath);
        const fileExtension = path.extname(filePath).toLowerCase();
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Generate SHA-256 hash
        const fileBuffer = fs.readFileSync(filePath);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

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
        } catch (extractErr) {
            console.error(`[DLP] Failed to extract text from ${fileName}:`, extractErr.message);
            // We continue with empty extractedText to at least log the file metadata
        }

        const { detectedCategories, sensitivityPoints } = scanText(extractedText || "");
        const isBulk = (extractedText || "").length > 5000;

        // Immediately clear extracted text from memory
        extractedText = null;

        return {
            fileHash,
            fileType: fileExtension,
            fileSize,
            detectedCategories: detectedCategories || [],
            sensitivityPoints: sensitivityPoints || 0,
            isBulk
        };
    } catch (err) {
        console.error(`[DLP] inspectAttachment global error (${fileName}):`, err.message);
        return {
            error: err.message,
            detectedCategories: [],
            sensitivityPoints: 0,
            action: 'PASS'
        };
    }
}

module.exports = { inspectAttachment };
