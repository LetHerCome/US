// Runtime-sized derivatives of three approved masters. The masters are only ever
// READ here (their SHA-256 is verified first); each output is a deterministic
// area-average downscale (premultiplied alpha) of its master, written under
// assets/derived/runtime/ and registered in ASSET_MANIFEST.json.
//
//   node scripts/build-runtime-derivatives.mjs           write the derivatives
//   node scripts/build-runtime-derivatives.mjs --check   verify they are current
//
// Pure Node (zlib only): same bytes on Windows, macOS and Linux.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DERIVATIVES = [
  {
    // Shown at <= 58 CSS px (top bar, auth logo, settings mark, favicon).
    output: 'assets/derived/runtime/us-symbol-256-v1.png',
    source: 'assets/derived/brand/us-symbol-apk-foreground-v1.png',
    sourceSha256: 'f71c0cf6cbca172b7833754f6eaa2b4addfab6381a696bdccf070d83ea690868',
    width: 256,
    operation: 'AREA_AVERAGE_DOWNSCALE_256_PRESERVE_ASPECT',
    purpose: 'Runtime-sized (256 px) derivative of the canonical US symbol for in-app display; the master stays the PWA install icon',
    usedBy: ['auth-branding', 'home-header-branding', 'settings-branding']
  },
  {
    // Shown at 20-22 CSS px in the Noi header.
    output: 'assets/derived/runtime/us-icon-settings-128-v1.png',
    source: 'assets/source/ui/us-icon-settings-v1.png',
    sourceSha256: 'c939f83506dc0bf323f194d4c88c6ccd5530d7f78954b43e3f4ef297b7876e88',
    width: 128,
    operation: 'AREA_AVERAGE_DOWNSCALE_128_PRESERVE_ASPECT',
    purpose: 'Runtime-sized (128 px wide) derivative of the approved Settings custom icon',
    usedBy: ['settings']
  },
  {
    // Shown at 22 CSS px on the Stories add button.
    output: 'assets/derived/runtime/us-icon-stories-128-v1.png',
    source: 'assets/source/ui/us-icon-stories-v1.png',
    sourceSha256: '455422f08fe0334bfc6d780ace5f1881d84f878e4c41b676c7daa7ef6858bc06',
    width: 128,
    operation: 'AREA_AVERAGE_DOWNSCALE_128_PRESERVE_ASPECT',
    purpose: 'Runtime-sized (128 px wide) derivative of the approved Stories custom icon',
    usedBy: ['header-stories-trigger']
  }
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG');
  let offset = 8; let header = null; const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  if (!header || header.depth !== 8 || header.color !== 6 || header.interlace !== 0) {
    throw new Error('Only 8-bit non-interlaced RGBA PNG masters are supported');
  }
  const { width, height } = header;
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

export function encodePng({ width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Paeth on every row: smaller than filter 0 for smooth gradients, still deterministic.
    raw[y * (stride + 1)] = 4;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - predictor) & 0xff;
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Exact area-average (box) downscale, alpha-weighted so transparent pixels never bleed colour.
export function downscale({ width, height, pixels }, targetWidth) {
  const targetHeight = Math.max(1, Math.round((height * targetWidth) / width));
  const scaleX = width / targetWidth; const scaleY = height / targetHeight;
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = ty * scaleY; const y1 = (ty + 1) * scaleY;
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = tx * scaleX; const x1 = (tx + 1) * scaleX;
      let r = 0; let g = 0; let b = 0; let a = 0; let weightSum = 0;
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x += 1) {
          const w = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const i = (y * width + x) * 4; const alpha = pixels[i + 3] * w;
          r += pixels[i] * alpha; g += pixels[i + 1] * alpha; b += pixels[i + 2] * alpha; a += alpha; weightSum += w;
        }
      }
      const o = (ty * targetWidth + tx) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / weightSum);
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: out };
}

export function buildDerivative(entry, root = ROOT) {
  const master = readFileSync(path.join(root, entry.source));
  if (sha256(master) !== entry.sourceSha256) throw new Error(`${entry.source}: master SHA-256 changed; refusing to derive`);
  return encodePng(downscale(decodePng(master), entry.width));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const entry of DERIVATIVES) {
    const bytes = buildDerivative(entry);
    const target = path.join(ROOT, entry.output);
    if (check) {
      let current = null; try { current = readFileSync(target); } catch (_) {}
      if (!current || !current.equals(bytes)) { stale += 1; console.error(`stale: ${entry.output}`); }
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      console.log(`${entry.output} ${bytes.length} bytes sha256=${sha256(bytes)}`);
    }
  }
  if (stale) process.exit(1);
}
