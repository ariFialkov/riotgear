// Generates PWA icons as PNGs with no native dependencies (tiny PNG encoder on top of zlib).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Icon art: dark rounded square, orange/red flame-ish "R" shield mark drawn with simple SDF shapes.
function drawIcon(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.1 : 0;
  const r = size * (maskable ? 0 : 0.22);
  const cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded square background
      const dx = Math.max(Math.abs(x - cx) - (size / 2 - r), 0);
      const dy = Math.max(Math.abs(y - cy) - (size / 2 - r), 0);
      const inside = Math.hypot(dx, dy) <= r;
      let R = 11, G = 13, B = 18, A = inside ? 255 : 0;
      if (maskable) { R = 11; G = 13; B = 18; A = 255; }
      // shield shape
      const sx = (x - cx) / (size / 2 - pad), sy = (y - cy) / (size / 2 - pad);
      const shieldTop = -0.62, shieldBottom = 0.7;
      const w = 0.52 * (sy < 0.1 ? 1 : 1 - ((sy - 0.1) / (shieldBottom - 0.1)) ** 1.6);
      const inShield = sy > shieldTop && sy < shieldBottom && Math.abs(sx) < w;
      if (inShield) {
        // orange gradient with a diagonal red stripe
        const t = (sy - shieldTop) / (shieldBottom - shieldTop);
        R = 255; G = Math.round(120 - 60 * t); B = Math.round(40 - 30 * t);
        const stripe = Math.abs(sx - sy * 0.6 + 0.05) < 0.09;
        if (stripe) { R = 240; G = 40; B = 60; }
        A = 255;
      }
      // dark "line" bar across the shield centre
      if (inShield && Math.abs(sy - 0.05) < 0.07 && Math.abs(sx) < w * 0.9) { R = 20; G = 22; B = 30; }
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = A;
    }
  }
  return px;
}

for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true]]) {
  writeFileSync(join(outDir, name), encodePNG(size, size, drawIcon(size, maskable)));
}
console.log('icons written to', outDir);
