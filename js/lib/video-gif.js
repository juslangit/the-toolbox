// Video → animated GIF (gifenc, MIT) or animated WebP (frames from the
// browser's own WebP encoder, wrapped into an animation by hand).
import { openDecodable } from './video-core.js';

let gifencP;
const gifenc = () => (gifencP ||= import('../../vendor/gifenc.js'));

// The frame times for a clip: start .. start+duration at fps.
export function frameTimes(start, duration, fps) {
  const n = Math.max(1, Math.round(duration * fps));
  return Array.from({ length: n }, (_, i) => start + i / fps);
}

// Works out the real range: duration 0 means "whole clip, up to 15 s".
export function clipRange(total, start = 0, duration = 0) {
  start = Math.max(0, Math.min(start || 0, Math.max(0, total - 0.05)));
  let d = duration > 0 ? duration : Math.min(15, total - start);
  d = Math.max(0.05, Math.min(d, total - start));
  return { start, duration: d };
}

// Decodes frames at `width` and hands each one's pixels to fn(imageData, i, n).
async function eachFrame(file, { fps, width, start, duration }, fn, onProgress) {
  const v = await openDecodable(file);
  try {
    const total = await v.input.computeDuration();
    const r = clipRange(total, start, duration);
    const vw = await v.video.getDisplayWidth(), vh = await v.video.getDisplayHeight();
    const w = Math.max(16, Math.round(Math.min(width || vw, vw * 2)) & ~1);
    const hgt = Math.max(2, Math.round(w * vh / vw) & ~1);
    const sink = new v.M.CanvasSink(v.video, { width: w, height: hgt, fit: 'fill', poolSize: 2 });
    const times = frameTimes(r.start, r.duration, fps);
    const c = new OffscreenCanvas(w, hgt);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    let i = 0;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (wc) { ctx.clearRect(0, 0, w, hgt); ctx.drawImage(wc.canvas, 0, 0, w, hgt); }
      await fn(ctx, c, i, times.length);
      onProgress?.((i + 1) / times.length);
      i++;
    }
    return { width: w, height: hgt, frames: times.length, ...r };
  } finally { v.close(); }
}

// Returns { blob, width, height, frames, start, duration }.
// loop: true = forever, false = play once.
export async function makeGif(file, { fps = 12, width = 480, start = 0, duration = 0, loop = true, colours = 256 } = {}, onProgress) {
  const { GIFEncoder, quantize, applyPalette } = await gifenc();
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  const info = await eachFrame(file, { fps, width, start, duration }, (ctx, c, i) => {
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const palette = quantize(data, colours, { format: 'rgb565' });
    const index = applyPalette(data, palette, 'rgb565');
    gif.writeFrame(index, c.width, c.height, { palette, delay, repeat: i === 0 ? (loop ? 0 : -1) : undefined });
  }, onProgress);
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), ...info };
}

// Can this browser encode WebP from a canvas? (Safari cannot.)
let webpOk;
export async function canWebp() {
  if (webpOk != null) return webpOk;
  try {
    const c = new OffscreenCanvas(2, 2);
    c.getContext('2d').fillRect(0, 0, 1, 1);
    const b = await c.convertToBlob({ type: 'image/webp' });
    webpOk = b.type === 'image/webp';
  } catch { webpOk = false; }
  return webpOk;
}

// Reads a still WebP file into its chunks (fourcc → bytes).
function webpChunks(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  for (let o = 12; o + 8 <= buf.length;) {
    const id = String.fromCharCode(...buf.subarray(o, o + 4)), size = dv.getUint32(o + 4, true);
    out.push({ id, data: buf.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return out;
}

// Builds an animated WebP from still WebP frames (same size).
export function assembleWebp(frames, width, height, delayMs, loop = true) {
  const parts = [];
  const u24 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
  const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const chunk = (id, bytes) => {
    const len = bytes.length;
    const head = new Uint8Array([...[...id].map(c => c.charCodeAt(0)), ...u32(len)]);
    return len & 1 ? [head, bytes, new Uint8Array(1)] : [head, bytes];
  };
  const cat = arr => { const n = arr.reduce((a, b) => a + b.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arr) { o.set(a, p); p += a.length; } return o; };
  let alpha = false;
  const anmfs = frames.map(f => {
    const keep = webpChunks(f).filter(c => c.id === 'ALPH' || c.id === 'VP8 ' || c.id === 'VP8L');
    if (keep.some(c => c.id === 'ALPH' || c.id === 'VP8L')) alpha = true;
    const head = new Uint8Array([...u24(0), ...u24(0), ...u24(width - 1), ...u24(height - 1), ...u24(delayMs), 0b10]);
    return cat(chunk('ANMF', cat([head, ...keep.flatMap(c => chunk(c.id, c.data))])));
  });
  const vp8x = new Uint8Array([0b10 | (alpha ? 0b10000 : 0), 0, 0, 0, ...u24(width - 1), ...u24(height - 1)]);
  const anim = new Uint8Array([0, 0, 0, 0, loop ? 0 : 1, 0]);
  parts.push(...chunk('VP8X', vp8x), ...chunk('ANIM', anim), ...anmfs);
  const body = cat(parts);
  return new Blob([cat([new Uint8Array([82, 73, 70, 70, ...u32(body.length + 4), 87, 69, 66, 80]), body])], { type: 'image/webp' });
}

export async function makeWebp(file, { fps = 12, width = 480, start = 0, duration = 0, loop = true, quality = 0.8 } = {}, onProgress) {
  if (!(await canWebp())) throw new Error('This browser cannot make WebP images. Use GIF instead.');
  const stills = [];
  const info = await eachFrame(file, { fps, width, start, duration }, async (ctx, c) => {
    const b = await c.convertToBlob({ type: 'image/webp', quality });
    stills.push(new Uint8Array(await b.arrayBuffer()));
  }, onProgress);
  return { blob: assembleWebp(stills, info.width, info.height, Math.round(1000 / fps), loop), ...info };
}

// Reads a GIF's frame count and size (for checks and the result line).
export function gifInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const width = b[6] | (b[7] << 8), height = b[8] | (b[9] << 8);
  let p = 13, frames = 0;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  const skipBlocks = () => { while (b[p]) p += b[p] + 1; p++; };
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x21) { p++; skipBlocks(); }
    else if (t === 0x2c) {
      frames++;
      const flags = b[p + 8]; p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; skipBlocks();
    } else break;
  }
  return { width, height, frames };
}
