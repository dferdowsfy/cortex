#!/usr/bin/env node
/**
 * Generate Complyze app icon: shield with checkmark on indigo/purple gradient.
 * Matches the web app's brand icon. Pure Node.js — no dependencies.
 *
 * Outputs icon.png (1024x1024) for electron-builder.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── Minimal PNG encoder ──────────────────────────────────────────
function crc32(buf) {
    let c = 0xFFFFFFFF;
    const tbl = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let v = i;
        for (let j = 0; j < 8; j++) v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
        tbl[i] = v;
    }
    for (let i = 0; i < buf.length; i++) c = tbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
    // Build filtered rows
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        raw[y * (1 + width * 4)] = 0; // filter: None
        rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Color helpers ────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// ── Draw the icon ────────────────────────────────────────────────
function drawIcon(size) {
    const buf = Buffer.alloc(size * size * 4);
    const cx = size / 2, cy = size / 2;
    const pad = size * 0.08; // padding for rounded rect

    // Brand colors (indigo/purple gradient)
    const bg1 = { r: 79, g: 70, b: 229 };   // indigo-600
    const bg2 = { r: 99, g: 102, b: 241 };  // indigo-500
    const cornerR = size * 0.22; // rounded corner radius

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const px = (y * size + x) * 4;
            const nx = x / size, ny = y / size;

            // ── Rounded rectangle mask ──
            let inRect = true;
            let rectAlpha = 1.0;

            // Check corners
            const left = pad, right = size - pad, top = pad, bottom = size - pad;
            if (x < left + cornerR && y < top + cornerR) {
                const d = Math.sqrt((x - left - cornerR) ** 2 + (y - top - cornerR) ** 2);
                if (d > cornerR + 1) inRect = false;
                else if (d > cornerR - 1) rectAlpha = Math.max(0, cornerR + 1 - d) / 2;
            } else if (x > right - cornerR && y < top + cornerR) {
                const d = Math.sqrt((x - right + cornerR) ** 2 + (y - top - cornerR) ** 2);
                if (d > cornerR + 1) inRect = false;
                else if (d > cornerR - 1) rectAlpha = Math.max(0, cornerR + 1 - d) / 2;
            } else if (x < left + cornerR && y > bottom - cornerR) {
                const d = Math.sqrt((x - left - cornerR) ** 2 + (y - bottom + cornerR) ** 2);
                if (d > cornerR + 1) inRect = false;
                else if (d > cornerR - 1) rectAlpha = Math.max(0, cornerR + 1 - d) / 2;
            } else if (x > right - cornerR && y > bottom - cornerR) {
                const d = Math.sqrt((x - right + cornerR) ** 2 + (y - bottom + cornerR) ** 2);
                if (d > cornerR + 1) inRect = false;
                else if (d > cornerR - 1) rectAlpha = Math.max(0, cornerR + 1 - d) / 2;
            } else if (x < left || x > right || y < top || y > bottom) {
                inRect = false;
            }

            if (!inRect) {
                buf[px] = 0; buf[px + 1] = 0; buf[px + 2] = 0; buf[px + 3] = 0;
                continue;
            }

            // ── Background gradient (top-left to bottom-right) ──
            const t = (nx + ny) / 2;
            let r = lerp(bg1.r, bg2.r, t);
            let g = lerp(bg1.g, bg2.g, t);
            let b = lerp(bg1.b, bg2.b, t);

            // ── Shield shape ──
            // Shield: wider at top, narrowing to a point at bottom
            const shieldCx = cx, shieldCy = cy * 0.95;
            const shieldW = size * 0.30; // half-width at top
            const shieldTop = cy * 0.35;
            const shieldBot = cy * 1.55;
            const shieldMid = cy * 1.05; // where sides start tapering

            // Normalize y within shield
            const sy = y;
            let inShield = false;
            let shieldEdge = 1.0;

            if (sy >= shieldTop && sy <= shieldBot) {
                let halfW;
                if (sy <= shieldMid) {
                    // Upper part: straight sides with slight curve at top
                    const nt = (sy - shieldTop) / (shieldMid - shieldTop);
                    // Slight inward curve at very top (shoulder)
                    const shoulderT = Math.min(1, nt * 3);
                    halfW = shieldW * (0.85 + 0.15 * shoulderT);
                } else {
                    // Lower part: taper to point
                    const nt = (sy - shieldMid) / (shieldBot - shieldMid);
                    halfW = shieldW * (1 - nt * nt); // quadratic taper
                }

                const dx = Math.abs(x - shieldCx);
                if (dx <= halfW) {
                    inShield = true;
                    shieldEdge = Math.min(1, (halfW - dx) * 2);
                } else if (dx <= halfW + 1.5) {
                    inShield = true;
                    shieldEdge = Math.max(0, (halfW + 1.5 - dx) / 1.5);
                }
            }

            if (inShield && shieldEdge > 0) {
                // White shield with slight transparency
                const sr = 255, sg = 255, sb = 255;
                const sa = 0.95 * shieldEdge;
                r = lerp(r, sr, sa);
                g = lerp(g, sg, sa);
                b = lerp(b, sb, sa);
            }

            // ── Checkmark inside shield ──
            if (inShield) {
                const checkCx = cx, checkCy = cy * 0.92;
                const checkScale = size * 0.0028;

                // Checkmark: two line segments
                // From (-40, 5) to (-12, 33) to (42, -25)  (in checkmark-local coords)
                const checkPts = [
                    { x1: -38, y1: 5, x2: -12, y2: 30 },   // left stroke
                    { x1: -12, y1: 30, x2: 40, y2: -22 },   // right stroke
                ];
                const strokeW = 14 * checkScale;

                let checkDist = Infinity;
                for (const seg of checkPts) {
                    const px0 = checkCx + seg.x1 * checkScale;
                    const py0 = checkCy + seg.y1 * checkScale;
                    const px1 = checkCx + seg.x2 * checkScale;
                    const py1 = checkCy + seg.y2 * checkScale;

                    // Distance from point to line segment
                    const dx0 = px1 - px0, dy0 = py1 - py0;
                    const len2 = dx0 * dx0 + dy0 * dy0;
                    let t0 = len2 > 0 ? ((x - px0) * dx0 + (y - py0) * dy0) / len2 : 0;
                    t0 = Math.max(0, Math.min(1, t0));
                    const closestX = px0 + t0 * dx0, closestY = py0 + t0 * dy0;
                    const d = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
                    checkDist = Math.min(checkDist, d);
                }

                if (checkDist <= strokeW) {
                    // Draw checkmark in brand color (indigo)
                    const ca = Math.min(1, (strokeW - checkDist + 1));
                    r = lerp(r, bg1.r * 0.85, ca);
                    g = lerp(g, bg1.g * 0.85, ca);
                    b = lerp(b, bg1.b * 0.85, ca);
                }
            }

            buf[px] = clamp(r);
            buf[px + 1] = clamp(g);
            buf[px + 2] = clamp(b);
            buf[px + 3] = clamp(255 * rectAlpha);
        }
    }
    return buf;
}

// ── Generate ─────────────────────────────────────────────────────
const size = 1024;
console.log(`Generating ${size}x${size} icon...`);
const rgba = drawIcon(size);
const png = encodePNG(size, size, rgba);
const outPath = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`Written ${outPath} (${png.length} bytes)`);

// Also generate 512x512 for additional use
const size2 = 512;
console.log(`Generating ${size2}x${size2} icon...`);
const rgba2 = drawIcon(size2);
const png2 = encodePNG(size2, size2, rgba2);
const outPath2 = path.join(__dirname, '..', 'icon-512.png');
fs.writeFileSync(outPath2, png2);
console.log(`Written ${outPath2} (${png2.length} bytes)`);

// Generate macOS .icns-compatible 256x256
const size3 = 256;
const rgba3 = drawIcon(size3);
const png3 = encodePNG(size3, size3, rgba3);
const outPath3 = path.join(__dirname, '..', 'icon-256.png');
fs.writeFileSync(outPath3, png3);
console.log(`Written ${outPath3} (${png3.length} bytes)`);

console.log('Done. Use icon.png for electron-builder.');
