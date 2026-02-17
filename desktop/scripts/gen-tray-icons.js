#!/usr/bin/env node
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createCirclePNG(size, r, g, b) {
  const width = size, height = size;
  const cx = size / 2, cy = size / 2;
  const radius = size / 2 - 2;

  // Build raw RGBA rows with filter byte
  const raw = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4);
    raw[off] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = off + 1 + x * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= radius) {
        const alpha = Math.min(1, radius - dist + 0.5);
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = Math.round(alpha * 255);
      }
    }
  }

  const compressed = zlib.deflateSync(raw);

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

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const dest = path.join(__dirname, '..');
const icons = [
  ['tray-active.png',     32, 0x22, 0xC5, 0x5E],
  ['tray-inactive.png',   32, 0x9C, 0xA3, 0xAF],
  ['tray-active@2x.png',  64, 0x22, 0xC5, 0x5E],
  ['tray-inactive@2x.png',64, 0x9C, 0xA3, 0xAF],
];

for (const [name, size, r, g, b] of icons) {
  const buf = createCirclePNG(size, r, g, b);
  fs.writeFileSync(path.join(dest, name), buf);
  console.log(name, buf.length, 'bytes');
}
console.log('Done.');
