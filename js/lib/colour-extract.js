// Palette extraction: weighted k-means (k-means++ start, fixed seed so the same
// image always gives the same palette) in OKLab, so clusters match what the eye
// groups together. Runs in small chunks with pauses so the page stays responsive.
import { toLinear, fromOklab, rng } from './colour-maths.js';

const LIN = Float64Array.from({ length: 256 }, (_, i) => toLinear(i / 255));
function lab(r, g, b) {
  r = LIN[r]; g = LIN[g]; b = LIN[b];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const pause = () => new Promise(r => setTimeout(r, 0));

// data: RGBA bytes. Returns [{ colour, share }] biggest first.
export async function extract(data, k = 6, { onprogress } = {}) {
  // 1. Count unique colours (transparent pixels skipped).
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const n = counts.size;
  if (!n) return [];
  const P = new Float64Array(n * 3), W = new Float64Array(n);
  let j = 0, total = 0;
  for (const [key, w] of counts) {
    const [L, A, B] = lab(key >> 16 & 255, key >> 8 & 255, key & 255);
    P[j * 3] = L; P[j * 3 + 1] = A; P[j * 3 + 2] = B; W[j] = w; total += w; j++;
  }
  // 2. k-means++ seeding.
  const rand = rng(12345);
  const C = [];
  const D = new Float64Array(n).fill(Infinity);
  let first = 0, best = -1;
  for (let i = 0; i < n; i++) if (W[i] > best) { best = W[i]; first = i; }
  C.push([P[first * 3], P[first * 3 + 1], P[first * 3 + 2]]);
  while (C.length < k) {
    const c = C[C.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = (P[i * 3] - c[0]) ** 2 + (P[i * 3 + 1] - c[1]) ** 2 + (P[i * 3 + 2] - c[2]) ** 2;
      if (d < D[i]) D[i] = d;
      sum += D[i] * W[i];
    }
    if (sum < 1e-9) break; // fewer distinct colours than k
    let t = rand() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { t -= D[i] * W[i]; if (t <= 0) { pick = i; break; } }
    C.push([P[pick * 3], P[pick * 3 + 1], P[pick * 3 + 2]]);
  }
  // 3. Lloyd iterations.
  const K = C.length, label = new Int32Array(n);
  for (let it = 0; it < 40; it++) {
    const acc = new Float64Array(K * 4);
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < K; c++) {
        const d = (P[i * 3] - C[c][0]) ** 2 + (P[i * 3 + 1] - C[c][1]) ** 2 + (P[i * 3 + 2] - C[c][2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      label[i] = bi;
      acc[bi * 4] += P[i * 3] * W[i]; acc[bi * 4 + 1] += P[i * 3 + 1] * W[i]; acc[bi * 4 + 2] += P[i * 3 + 2] * W[i]; acc[bi * 4 + 3] += W[i];
    }
    let moved = 0;
    for (let c = 0; c < K; c++) {
      const w = acc[c * 4 + 3];
      if (!w) continue;
      const nc = [acc[c * 4] / w, acc[c * 4 + 1] / w, acc[c * 4 + 2] / w];
      moved = Math.max(moved, Math.hypot(nc[0] - C[c][0], nc[1] - C[c][1], nc[2] - C[c][2]));
      C[c] = nc;
    }
    onprogress?.((it + 1) / 40);
    await pause();
    if (moved < 1e-5) break;
  }
  // 4. Shares, then colours.
  const share = new Float64Array(K);
  for (let i = 0; i < n; i++) share[label[i]] += W[i];
  return C.map((c, i) => ({ colour: fromOklab(c[0], c[1], c[2]), share: share[i] / total, lab: c }))
    .filter(x => x.share > 0)
    .sort((a, b) => b.share - a.share);
}
