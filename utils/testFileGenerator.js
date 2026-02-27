'use strict';

/**
 * testFileGenerator.js
 * Generates synthetic test files containing PII for proxy deep-inspection testing.
 * Produces: PDF, DOCX, PNG (with embedded text), CSV, ZIP, nested ZIP.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

// Lazy-load heavy dependencies to avoid startup cost when not all are needed
function requirePDFLib() { return require('pdf-lib'); }
function requireMammoth() { return require('mammoth'); }
function requireJsZip() { return require('jszip'); }
function requireCanvas() { return require('canvas'); }

/**
 * Generate a minimal PDF containing PII text using pdf-lib.
 * Falls back to a raw hand-crafted PDF if pdf-lib unavailable.
 */
async function generatePDF(outputPath, { ssn, apiKey, creditCard }) {
  try {
    const { PDFDocument, rgb, StandardFonts } = requirePDFLib();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const lines = [
      'CONFIDENTIAL — TEST DOCUMENT',
      '',
      'Employee Record',
      `Name: John Q. Testuser`,
      `Social Security Number: ${ssn}`,
      `Credit Card: ${creditCard}`,
      `API Access Key: ${apiKey}`,
      '',
      'This document is used for automated proxy validation testing.',
      'Do not distribute.',
    ];

    let y = 720;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
      y -= 20;
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return outputPath;
  } catch (err) {
    console.warn(`  [testFileGenerator] pdf-lib unavailable (${err.message}), generating raw PDF`);
    return generateRawPDF(outputPath, { ssn, apiKey, creditCard });
  }
}

/**
 * Generate a hand-crafted minimal PDF without external dependencies.
 */
function generateRawPDF(outputPath, { ssn, apiKey, creditCard }) {
  const content = [
    'CONFIDENTIAL TEST DOCUMENT',
    `SSN: ${ssn}`,
    `CREDIT: ${creditCard}`,
    `API_KEY: ${apiKey}`,
  ].join('\n');

  const stream = `BT /F1 12 Tf 50 700 Td (${content.replace(/[()\\]/g, '\\$&').replace(/\n/g, ') Tj T* (')}) Tj ET`;
  const streamLen = Buffer.byteLength(stream, 'latin1');

  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj',
    '2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj',
    `3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${streamLen}>>`,
    'stream',
    stream,
    'endstream',
    'endobj',
    '5 0 obj<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000266 00000 n ',
    `${String(266 + streamLen + 50).padStart(10, '0')} 00000 n `,
    'trailer<</Size 6 /Root 1 0 R>>',
    'startxref',
    '0',
    '%%EOF',
  ].join('\n');

  fs.writeFileSync(outputPath, pdf, 'latin1');
  return outputPath;
}

/**
 * Generate a DOCX file (actually a ZIP with XML inside) containing PII.
 * Falls back to a minimal hand-crafted DOCX if jszip is unavailable.
 */
async function generateDOCX(outputPath, { ssn, apiKey, creditCard }) {
  try {
    const JSZip = requireJsZip();
    const zip = new JSZip();

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>CONFIDENTIAL — TEST DOCUMENT</w:t></w:r></w:p>
    <w:p><w:r><w:t>Employee Record</w:t></w:r></w:p>
    <w:p><w:r><w:t>Social Security Number: ${ssn}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Credit Card: ${creditCard}</w:t></w:r></w:p>
    <w:p><w:r><w:t>API Key: ${apiKey}</w:t></w:r></w:p>
    <w:p><w:r><w:t>This document is used for proxy validation testing.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/document.xml', docXml);

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`  [testFileGenerator] jszip unavailable (${err.message}), generating minimal DOCX`);
    // Write a minimal ZIP/DOCX manually
    const docXmlContent = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>SSN: ${ssn} KEY: ${apiKey}</w:t></w:r></w:p></w:body></w:document>`;
    fs.writeFileSync(outputPath, `PK\x03\x04` + docXmlContent); // Minimal invalid ZIP with content
    return outputPath;
  }
}

/**
 * Generate a PNG image with PII text embedded using canvas.
 * Falls back to a PNG containing PII in its metadata/tEXt chunk.
 */
async function generatePNG(outputPath, { ssn, apiKey, creditCard }) {
  try {
    const { createCanvas } = requireCanvas();
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 400);

    // Black text with PII
    ctx.fillStyle = '#000000';
    ctx.font = '20px sans-serif';
    ctx.fillText('CONFIDENTIAL TEST IMAGE', 20, 40);
    ctx.fillText(`Social Security Number: ${ssn}`, 20, 80);
    ctx.fillText(`Credit Card Number: ${creditCard}`, 20, 120);
    ctx.fillText(`API Key: ${apiKey}`, 20, 160);
    ctx.fillText('Generated for proxy validation testing', 20, 200);

    // Smaller text to test OCR edge cases
    ctx.font = '12px sans-serif';
    ctx.fillText(`Hidden: SSN=${ssn} CC=${creditCard}`, 20, 280);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`  [testFileGenerator] canvas unavailable (${err.message}), generating PNG with tEXt chunk`);
    return generatePNGWithTextChunk(outputPath, { ssn, apiKey });
  }
}

/**
 * Generate a PNG with PII embedded in a tEXt metadata chunk.
 * This is a valid PNG (1x1 pixel) with extra tEXt chunks.
 */
function generatePNGWithTextChunk(outputPath, { ssn, apiKey }) {
  function crc32(buf) {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);
    const crcInput = Buffer.concat([typeBuf, dataBuf]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 1x1 pixel, 8-bit grayscale
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);  // width
  ihdrData.writeUInt32BE(1, 4);  // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 0;  // color type: grayscale
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // tEXt chunks with PII
  const text1 = makeChunk('tEXt', Buffer.from(`Comment\0SSN: ${ssn} API_KEY: ${apiKey}`));
  const text2 = makeChunk('tEXt', Buffer.from(`Description\0CONFIDENTIAL: SSN=${ssn}`));

  // IDAT: single white pixel (zlib-compressed)
  const zlib = require('zlib');
  const pixelRow = Buffer.from([0, 255]); // filter byte + pixel value
  const compressed = zlib.deflateSync(pixelRow);
  const idat = makeChunk('IDAT', compressed);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([signature, ihdr, text1, text2, idat, iend]);
  fs.writeFileSync(outputPath, png);
  return outputPath;
}

/**
 * Generate a CSV file containing PII rows.
 */
function generateCSV(outputPath, { ssn, apiKey, creditCard }) {
  const rows = [
    'id,name,ssn,credit_card,api_key,department',
    `1,John Testuser,${ssn},${creditCard},${apiKey},Engineering`,
    `2,Jane Testuser,987-65-4321,5500-0000-0000-0004,sk-other-test,Finance`,
    `3,Bob Testuser,111-22-3333,${creditCard},${apiKey},HR`,
  ];
  fs.writeFileSync(outputPath, rows.join('\n') + '\n');
  return outputPath;
}

/**
 * Generate a ZIP file containing the PDF (and optionally other files).
 */
async function generateZIP(outputPath, innerFiles) {
  try {
    const JSZip = requireJsZip();
    const zip = new JSZip();

    for (const { name, filePath } of innerFiles) {
      const data = fs.readFileSync(filePath);
      zip.file(name, data);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`  [testFileGenerator] jszip unavailable for ZIP (${err.message})`);
    // Fallback: create a text file renamed as .zip
    const content = innerFiles.map((f) => `[${f.name}]: ${fs.readFileSync(f.filePath, 'utf8')}`).join('\n');
    fs.writeFileSync(outputPath, `PK\x03\x04` + content);
    return outputPath;
  }
}

/**
 * Generate a nested ZIP: zip-inside-zip containing a PDF with PII.
 */
async function generateNestedZIP(outputPath, innerZipPath) {
  try {
    const JSZip = requireJsZip();
    const outerZip = new JSZip();
    const innerData = fs.readFileSync(innerZipPath);
    outerZip.file('inner-archive.zip', innerData);
    outerZip.file('readme.txt', 'This outer archive contains a nested archive with sensitive data.');

    const buffer = await outerZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`  [testFileGenerator] jszip unavailable for nested ZIP (${err.message})`);
    const innerData = fs.readFileSync(innerZipPath);
    fs.writeFileSync(outputPath, Buffer.concat([Buffer.from('PK\x03\x04'), innerData]));
    return outputPath;
  }
}

/**
 * Main entry point: generate all test files in the given directory.
 * @param {string} outputDir
 * @param {{ ssn: string, apiKey: string, creditCard: string }} pii
 * @returns {Promise<string[]>} Array of file paths generated
 */
async function generateTestFiles(outputDir, pii) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = [];
  const ts = Date.now();

  console.log('  Generating PDF with PII...');
  const pdfPath = path.join(outputDir, `test-pii-${ts}.pdf`);
  await generatePDF(pdfPath, pii);
  files.push(pdfPath);

  console.log('  Generating DOCX with API key...');
  const docxPath = path.join(outputDir, `test-apikey-${ts}.docx`);
  await generateDOCX(docxPath, pii);
  files.push(docxPath);

  console.log('  Generating PNG with hidden text (OCR test)...');
  const pngPath = path.join(outputDir, `test-ocr-${ts}.png`);
  await generatePNG(pngPath, pii);
  files.push(pngPath);

  console.log('  Generating CSV with PII rows...');
  const csvPath = path.join(outputDir, `test-pii-${ts}.csv`);
  generateCSV(csvPath, pii);
  files.push(csvPath);

  console.log('  Generating ZIP containing PDF...');
  const zipPath = path.join(outputDir, `test-archive-${ts}.zip`);
  await generateZIP(zipPath, [{ name: 'confidential.pdf', filePath: pdfPath }]);
  files.push(zipPath);

  console.log('  Generating nested ZIP (ZIP-in-ZIP)...');
  const nestedZipPath = path.join(outputDir, `test-nested-${ts}.zip`);
  await generateNestedZIP(nestedZipPath, zipPath);
  files.push(nestedZipPath);

  // Verify all files exist and have non-zero size
  for (const f of files) {
    const stat = fs.statSync(f);
    if (stat.size === 0) {
      throw new Error(`Generated file is empty: ${f}`);
    }
  }

  return files;
}

/**
 * Extract and verify content from a file for post-upload validation.
 * Returns extracted text strings for PII checking.
 */
async function extractFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = { text: '', source: ext };

  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = fs.readFileSync(filePath);
      const parsed = await pdfParse(data);
      content.text = parsed.text;
    } else if (ext === '.docx') {
      const mammoth = requireMammoth();
      const result = await mammoth.extractRawText({ path: filePath });
      content.text = result.value;
    } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      const Tesseract = require('tesseract.js');
      const { data } = await Tesseract.recognize(filePath, 'eng', {
        logger: (m) => { if (process.env.VERBOSE) console.log(m); },
      });
      content.text = data.text;
      content.ocr = true;
    } else if (ext === '.csv') {
      content.text = fs.readFileSync(filePath, 'utf8');
    } else if (ext === '.zip') {
      const unzipper = require('unzipper');
      const directory = await unzipper.Open.file(filePath);
      const texts = [];
      for (const file of directory.files) {
        const fileExt = path.extname(file.path).toLowerCase();
        const buffer = await file.buffer();
        if (fileExt === '.pdf') {
          const pdfParse = require('pdf-parse');
          const parsed = await pdfParse(buffer);
          texts.push(parsed.text);
        } else if (fileExt === '.txt' || fileExt === '.csv') {
          texts.push(buffer.toString('utf8'));
        } else if (fileExt === '.zip') {
          // Nested ZIP: recurse one level
          const tempPath = `/tmp/nested-${Date.now()}.zip`;
          fs.writeFileSync(tempPath, buffer);
          const nested = await extractFileContent(tempPath);
          texts.push(nested.text);
          fs.unlinkSync(tempPath);
        }
      }
      content.text = texts.join('\n');
      content.recursive = true;
    }
  } catch (err) {
    content.error = err.message;
    content.text = '';
  }

  return content;
}

module.exports = {
  generateTestFiles,
  generatePDF,
  generateDOCX,
  generatePNG,
  generateCSV,
  generateZIP,
  generateNestedZIP,
  extractFileContent,
};
