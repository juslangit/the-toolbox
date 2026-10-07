// Shared image helpers for the Images drawer: decode a file to a canvas,
// resize well, encode to any format (including the ones canvas can't write:
// BMP, ICO, ICNS, GIF and palette PNG), trim, and pick out main colours.
// Everything runs on the device.
import { loadImage } from '../ui.js';

export const FORMATS = {
  'image/png': { ext: 'png', label: 'PNG' },
  'image/jpeg': { ext: 'jpg', label: 'JPEG' },
  'image/webp': { ext: 'webp', label: 'WebP' },
  'image/avif': { ext: 'avif', label: 'AVIF' },
  'image/gif': { ext: 'gif', label: 'GIF' },
  'image/bmp': { ext: 'bmp', label: 'BMP' },
  'image/x-icon': { ext: 'ico', label: 'ICO (Windows icon)' },
  'image/icns': { ext: 'icns', label: 'ICNS (Mac icon)' },
};
export const extOf = type => FORMATS[type]?.ext || 'png';
export const lossy = type => ['image/jpeg', 'image/webp', 'image/avif'].includes(type);

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

// Best guess at a MIME type when the browser leaves it blank (common for .heic, .ico).
export function typeOf(file) {
  if (file.type) return file.type;
  const e = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
    bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff' }[e] || '';
}

// File → canvas at its real size (EXIF rotation already applied by the browser).
// opts.svgSize: draw SVGs with their longest side at this size (they have no fixed pixels).
export async function decode(file, opts = {}) {
  let img;
  try { img = await loadImage(file); }
  catch {
    const t = typeOf(file);
    throw new Error(/heic|heif/.test(t) || /\.hei[cf]$/i.test(file.name)
      ? 'This browser cannot open HEIC photos. Safari on iPhone and Mac can; or export the photo as JPEG first.'
      : `Could not read ${file.name} as a picture.`);
  }
  let w = img.naturalWidth, hgt = img.naturalHeight;
  if (!w || !hgt) { w = 512; hgt = 512; } // SVG without a size
  if (opts.svgSize && (typeOf(file) === 'image/svg+xml')) {
    const k = opts.svgSize / Math.max(w, hgt);
    w = Math.round(w * k); hgt = Math.round(hgt * k);
  }
  const c = canvas(w, hgt);
  c.getContext('2d').drawImage(img, 0, 0, w, hgt);
  return c;
}

// High-quality resize: halve in steps so big downscales stay sharp, not jagged.
export function resize(src, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  let cur = src, cw = src.width, ch = src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    const n = canvas(Math.round(cw / 2), Math.round(ch / 2));
    const x = n.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, n.width, n.height);
    cur = n; cw = n.width; ch = n.height;
  }
  const out = canvas(w, h);
  const x = out.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, w, h);
  return out;
}

// Longest side → max, never upscaling.
export function fitMax(src, max) {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  return s >= 1 ? src : resize(src, src.width * s, src.height * s);
}

// Paint transparent areas a solid colour (for JPEG, which has no transparency).
export function flatten(src, colour = '#ffffff') {
  const c = canvas(src.width, src.height);
  const x = c.getContext('2d');
  x.fillStyle = colour; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0);
  return c;
}

const pixels = c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

export function hasAlpha(c) {
  const d = pixels(c).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

// --- encoding ------------------------------------------------------------------
const support = {};
// Can this browser's canvas write this type? (Safari can't write WebP/AVIF; Chrome can't write AVIF.)
export function canEncode(type) {
  if (['image/bmp', 'image/x-icon', 'image/icns', 'image/gif'].includes(type)) return Promise.resolve(true);
  return support[type] ??= new Promise(r => {
    try { canvas(2, 2).toBlob(b => r(!!b && b.type === type), type, 0.8); } catch { r(false); }
  });
}

// The type we will actually write, and a note if we had to fall back.
export async function pickType(type) {
  if (await canEncode(type)) return { type, note: '' };
  const label = FORMATS[type]?.label || type;
  for (const alt of ['image/webp', 'image/jpeg']) {
    if (alt !== type && await canEncode(alt)) return { type: alt, note: `This browser cannot save ${label}, so it was saved as ${FORMATS[alt].label} instead.` };
  }
  return { type: 'image/png', note: `This browser cannot save ${label}, so it was saved as PNG instead.` };
}

const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not encode the picture')), type, q));

// Canvas → Blob of any type in FORMATS. quality 0..1 for JPEG/WebP/AVIF.
// For PNG, opts.colours (2..256) writes a smaller palette PNG.
export async function encode(c, type = 'image/png', quality = 0.85, opts = {}) {
  if (type === 'image/bmp') return encodeBMP(c);
  if (type === 'image/gif') return encodeGIF(c);
  if (type === 'image/x-icon') return encodeICO(c, opts.sizes || [16, 32, 48, 256].filter(s => s <= Math.max(48, Math.max(c.width, c.height))));
  if (type === 'image/icns') return encodeICNS(c);
  if (type === 'image/png' && opts.colours) return encodePalettePNG(c, opts.colours);
  if (type === 'image/jpeg') c = flatten(c, opts.background || '#ffffff');
  return toBlob(c, type, lossy(type) ? quality : undefined);
}

// Square canvas of size s with the image centred and fitted (for icons).
export function square(src, s, { pad = 0, background = null } = {}) {
  const c = canvas(s, s);
  const x = c.getContext('2d');
  if (background) { x.fillStyle = background; x.fillRect(0, 0, s, s); }
  const inner = s * (1 - 2 * pad);
  const k = inner / Math.max(src.width, src.height);
  const w = src.width * k, h = src.height * k;
  const scaled = resize(src, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  x.drawImage(scaled, Math.round((s - scaled.width) / 2), Math.round((s - scaled.height) / 2));
  return c;
}

const u8 = async b => new Uint8Array(await b.arrayBuffer());

// ICO holding PNG images (every browser and Windows Vista+ read these).
export async function encodeICO(src, sizes = [16, 32, 48]) {
  const pngs = [];
  for (const s of sizes) pngs.push(await u8(await toBlob(src.width === s && src.height === s ? src : square(src, s), 'image/png')));
  const head = new DataView(new ArrayBuffer(6 + 16 * pngs.length));
  head.setUint16(2, 1, true); head.setUint16(4, pngs.length, true);
  let off = head.byteLength;
  pngs.forEach((p, i) => {
    const o = 6 + i * 16, s = sizes[i];
    head.setUint8(o, s >= 256 ? 0 : s); head.setUint8(o + 1, s >= 256 ? 0 : s);
    head.setUint16(o + 4, 1, true); head.setUint16(o + 6, 32, true);
    head.setUint32(o + 8, p.length, true); head.setUint32(o + 12, off, true);
    off += p.length;
  });
  return new Blob([head, ...pngs], { type: 'image/x-icon' });
}

// ICNS (macOS app icon) with PNG entries, 16 px to 1024 px.
export async function encodeICNS(src) {
  const kinds = [['icp4', 16], ['icp5', 32], ['ic11', 32], ['icp6', 64], ['ic12', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]];
  const cache = {}, parts = [];
  let total = 8;
  for (const [code, s] of kinds) {
    const png = cache[s] ??= await u8(await toBlob(square(src, s), 'image/png'));
    const hd = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 4; i++) hd.setUint8(i, code.charCodeAt(i));
    hd.setUint32(4, png.length + 8);
    parts.push(hd, png); total += png.length + 8;
  }
  const hd = new DataView(new ArrayBuffer(8));
  [0x69, 0x63, 0x6e, 0x73].forEach((b, i) => hd.setUint8(i, b));
  hd.setUint32(4, total);
  return new Blob([hd, ...parts], { type: 'image/icns' });
}

// BMP: 24-bit when opaque, 32-bit with an alpha mask otherwise.
export function encodeBMP(c) {
  const { data, width: w, height: h } = pixels(c);
  let alpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { alpha = true; break; }
  const bpp = alpha ? 4 : 3, rowSize = Math.ceil(w * bpp / 4) * 4;
  const hdr = alpha ? 108 : 40, off = 14 + hdr, size = off + rowSize * h;
  const v = new DataView(new ArrayBuffer(size));
  v.setUint16(0, 0x424d); v.setUint32(2, size, true); v.setUint32(10, off, true);
  v.setUint32(14, hdr, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, bpp * 8, true); v.setUint32(30, alpha ? 3 : 0, true);
  v.setUint32(34, rowSize * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  if (alpha) {
    v.setUint32(54, 0x00ff0000, true); v.setUint32(58, 0x0000ff00, true); v.setUint32(62, 0x000000ff, true); v.setUint32(66, 0xff000000, true);
    v.setUint32(70, 0x73524742, true); // 'sRGB'
  }
  for (let y = 0; y < h; y++) {
    let o = off + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      v.setUint8(o++, data[i + 2]); v.setUint8(o++, data[i + 1]); v.setUint8(o++, data[i]);
      if (alpha) v.setUint8(o++, data[i + 3]);
    }
  }
  return new Blob([v], { type: 'image/bmp' });
}

// --- colour reduction (median cut) ------------------------------------------------
// Returns { palette: [[r,g,b,a,count]], index: Uint8Array } with ≤ max colours.
// Exact when the picture already has ≤ max colours.
export function quantise(data, max = 256, { alpha = true } = {}) {
  const n = data.length / 4;
  const keyOf = i => alpha ? ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0
    : ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const k = alpha && data[i + 3] === 0 ? 0 : keyOf(i);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (counts.size > 200000) break;
  }
  const unpack = k => alpha ? [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255] : [k >>> 16, (k >>> 8) & 255, k & 255, 255];
  let palette;
  if (counts.size <= max && counts.size <= 200000 && countsComplete(counts, n)) {
    palette = [...counts].map(([k, c]) => [...unpack(k), c]);
  } else {
    // Median cut over 5-bit buckets.
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const a = alpha ? data[i + 3] : 255;
      const k = a < 8 ? -1 : ((data[i] >> 3) << 15) | ((data[i + 1] >> 3) << 10) | ((data[i + 2] >> 3) << 5) | (alpha ? (a >> 5) << 20 : 0);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = [0, 0, 0, 0, 0]);
      b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3] += a; b[4]++;
    }
    const clear = buckets.get(-1); buckets.delete(-1);
    const items = [...buckets.values()].map(b => [b[0] / b[4], b[1] / b[4], b[2] / b[4], b[3] / b[4], b[4]]);
    const boxes = [items];
    const slots = max - (clear ? 1 : 0);
    while (boxes.length < slots) {
      // split the box with the most pixels × widest range
      let best = -1, bestScore = 0, bestCh = 0;
      boxes.forEach((box, bi) => {
        if (box.length < 2) return;
        let pix = 0; const lo = [255, 255, 255, 255], hi = [0, 0, 0, 0];
        for (const it of box) { pix += it[4]; for (let c = 0; c < 4; c++) { if (it[c] < lo[c]) lo[c] = it[c]; if (it[c] > hi[c]) hi[c] = it[c]; } }
        const ranges = hi.map((v, c) => (v - lo[c]) * (c === 1 ? 1.2 : 1));
        const ch = ranges.indexOf(Math.max(...ranges));
        const score = ranges[ch] * Math.sqrt(pix);
        if (score > bestScore) { bestScore = score; best = bi; bestCh = ch; }
      });
      if (best < 0) break;
      const box = boxes[best].sort((a, b) => a[bestCh] - b[bestCh]);
      let total = 0; for (const it of box) total += it[4];
      let acc = 0, cut = 1;
      for (let i = 0; i < box.length - 1; i++) { acc += box[i][4]; if (acc >= total / 2) { cut = i + 1; break; } }
      boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
    palette = boxes.filter(b => b.length).map(box => {
      const s = [0, 0, 0, 0, 0];
      for (const it of box) { for (let c = 0; c < 4; c++) s[c] += it[c] * it[4]; s[4] += it[4]; }
      return [s[0] / s[4], s[1] / s[4], s[2] / s[4], s[3] / s[4], s[4]].map((v, i) => i < 4 ? Math.round(v) : v);
    });
    if (clear) palette.push([0, 0, 0, 0, clear[4]]);
  }
  // Map every pixel to its nearest palette entry (cached per colour).
  const index = new Uint8Array(n), cache = new Map();
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = alpha ? data[i + 3] : 255;
    const k = alpha && a === 0 ? 0 : keyOf(i);
    let best = cache.get(k);
    if (best === undefined) {
      let bd = Infinity; best = 0;
      for (let j = 0; j < palette.length; j++) {
        const q = palette[j];
        const d = (q[0] - data[i]) ** 2 * 2 + (q[1] - data[i + 1]) ** 2 * 4 + (q[2] - data[i + 2]) ** 2 * 3 + (q[3] - a) ** 2 * 3;
        if (d < bd) { bd = d; best = j; }
      }
      cache.set(k, best);
    }
    index[p] = best;
  }
  return { palette, index };
}
function countsComplete(counts, n) { let s = 0; for (const c of counts.values()) s += c; return s === n; }

// The main colours of a picture, biggest share first: [{ hex, share }].
export function dominant(c, k = 6) {
  const s = Math.min(1, 96 / Math.max(c.width, c.height));
  const small = s < 1 ? resize(c, c.width * s, c.height * s) : c;
  const d = pixels(small).data;
  const opaque = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) opaque.push(d[i], d[i + 1], d[i + 2], 255);
  if (!opaque.length) return [];
  const { palette } = quantise(new Uint8ClampedArray(opaque), k, { alpha: false });
  const total = palette.reduce((t, p) => t + p[4], 0);
  return palette.sort((a, b) => b[4] - a[4]).map(p => ({ hex: hex(p), share: p[4] / total }));
}
export const hex = p => '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// --- GIF (single frame) ----------------------------------------------------------
export function encodeGIF(c) {
  const { data, width: w, height: h } = pixels(c);
  // GIF transparency is on/off: snap alpha first.
  const d = new Uint8ClampedArray(data);
  let anyClear = false;
  for (let i = 3; i < d.length; i += 4) { if (d[i] < 128) { d[i] = 0; d[i - 1] = d[i - 2] = d[i - 3] = 0; anyClear = true; } else d[i] = 255; }
  const { palette, index } = quantise(d, 256);
  const clearIdx = anyClear ? palette.findIndex(p => p[3] === 0) : -1;
  let bits = 1; while ((1 << bits) < palette.length) bits++;
  const size = 1 << bits;
  const out = [];
  const push = (...b) => out.push(...b);
  const str = s => [...s].forEach(ch => out.push(ch.charCodeAt(0)));
  str('GIF89a');
  push(w & 255, w >> 8, h & 255, h >> 8, 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  for (let i = 0; i < size; i++) { const p = palette[i] || [0, 0, 0]; push(p[0], p[1], p[2]); }
  if (clearIdx >= 0) push(0x21, 0xf9, 4, 1, 0, 0, clearIdx, 0);
  push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0);
  const minCode = Math.max(2, bits);
  push(minCode);
  const lzw = lzwEncode(index, minCode);
  for (let i = 0; i < lzw.length; i += 255) { const chunk = lzw.subarray(i, i + 255); push(chunk.length); for (const b of chunk) out.push(b); }
  push(0, 0x3b);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

function lzwEncode(pixels, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  const out = [];
  let cur = 0, curBits = 0, codeSize = minCode + 1, next = eoi + 1;
  let dict = new Map();
  const emit = code => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 255); cur >>>= 8; curBits -= 8; }
  };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear); dict = new Map(); codeSize = minCode + 1; next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (curBits > 0) out.push(cur & 255);
  return new Uint8Array(out);
}

// --- palette PNG -------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, body) {
  const b = new Uint8Array(12 + body.length), v = new DataView(b.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.set(body, 8);
  v.setUint32(8 + body.length, crc32(b, 4, 8 + body.length));
  return b;
}

// A real 8-bit palette PNG — usually far smaller than the browser's 32-bit PNG.
export async function encodePalettePNG(c, colours = 256) {
  const { zlibSync } = await import('../../vendor/fflate.js');
  const { data, width: w, height: h } = pixels(c);
  const { palette, index } = quantise(data, colours);
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((p, i) => plte.set(p.slice(0, 3), i * 3));
  const lastAlpha = palette.reduce((m, p, i) => p[3] < 255 ? i : m, -1);
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(index.subarray(y * w, y * w + w), y * (w + 1) + 1);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('PLTE', plte)];
  if (lastAlpha >= 0) parts.push(pngChunk('tRNS', new Uint8Array(palette.slice(0, lastAlpha + 1).map(p => p[3]))));
  parts.push(pngChunk('IDAT', zlibSync(raw, { level: 9 })), pngChunk('IEND', new Uint8Array(0)));
  return new Blob(parts, { type: 'image/png' });
}

// --- trimming ------------------------------------------------------------------------
// Smallest box holding everything that is not background.
// mode 'alpha': background = (nearly) transparent. mode 'colour': background = the
// corner colour, within tolerance (0..255). Returns null if the picture is all background.
export function trimBox(c, { mode = 'auto', tolerance = 10 } = {}) {
  const { data: d, width: w, height: h } = pixels(c);
  if (mode === 'auto') {
    let clear = false;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) if (d[(y * w + x) * 4 + 3] < 255) clear = true;
    mode = clear ? 'alpha' : 'colour';
  }
  const bg = [d[0], d[1], d[2], d[3]];
  const isBg = mode === 'alpha'
    ? i => d[i + 3] <= tolerance
    : i => Math.abs(d[i] - bg[0]) <= tolerance && Math.abs(d[i + 1] - bg[1]) <= tolerance && Math.abs(d[i + 2] - bg[2]) <= tolerance && Math.abs(d[i + 3] - bg[3]) <= tolerance;
  let top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBg((y * w + x) * 4)) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top < 0) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, mode, bg: mode === 'colour' ? hex(bg) : null };
}

export function crop(src, { x, y, w, h }) {
  const c = canvas(w, h);
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

// RGB + luminance histograms, 256 bins each.
export function histogram(c) {
  const s = Math.min(1, 512 / Math.max(c.width, c.height));
  const small = s < 1 ? resize(c, c.width * s, c.height * s) : c;
  const d = pixels(small).data;
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++;
    l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
  }
  return { r, g, b, l };
}

export const gcd = (a, b) => b ? gcd(b, a % b) : a;
export function ratio(w, h) {
  const g = gcd(w, h), a = w / g, b = h / g;
  const named = [[1, 1], [4, 3], [3, 2], [16, 9], [16, 10], [21, 9], [5, 4], [4, 5], [3, 4], [2, 3], [9, 16], [1.91, 1], [2, 1], [3, 1]];
  if (a <= 50 && b <= 50) return `${a}:${b}`;
  const r = w / h;
  const near = named.find(([x, y]) => Math.abs(x / y - r) / r < 0.01);
  return near ? `≈ ${near[0]}:${near[1]}` : `${r.toFixed(3)}:1`;
}

export async function toFile(blob, name) {
  return new File([blob], name, { type: blob.type });
}
