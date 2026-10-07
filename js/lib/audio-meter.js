// Level and loudness measurements, written from the published standards:
//   ITU-R BS.1770-4 / EBU R128 integrated loudness (K-weighting, 400 ms blocks
//   with 75 % overlap, −70 LUFS absolute gate, −10 LU relative gate),
//   EBU Tech 3342 loudness range, and a 4× oversampled true-peak estimate.
// Also a gain + look-ahead peak limiter used by the normaliser.
import { makeBuffer, channelsOf } from './audio-wav.js';

const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// K-weighting filter coefficients for any sample rate (bilinear transform of
// the BS.1770 shelving and high-pass prototypes).
function kFilters(fs) {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs);
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, Q1 = 0.7071752369554196;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = {
    b: [(Vh + Vb * K / Q1 + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q1 + K * K) / a0],
    a: [2 * (K * K - 1) / a0, (1 - K / Q1 + K * K) / a0],
  };
  K = Math.tan(Math.PI * 38.13547087602444 / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const hp = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0] };
  return [shelf, hp];
}

// Sum of K-weighted squares per 100 ms segment, for one channel.
function segmentPower(x, fs, hop) {
  const [s, p] = kFilters(fs);
  const nSeg = Math.floor(x.length / hop);
  const out = new Float64Array(nSeg);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
  for (let seg = 0, i = 0; seg < nSeg; seg++) {
    let acc = 0;
    for (const end = i + hop; i < end; i++) {
      const xi = x[i];
      const y = s.b[0] * xi + s.b[1] * x1 + s.b[2] * x2 - s.a[0] * y1 - s.a[1] * y2;
      x2 = x1; x1 = xi;
      const z = p.b[0] * y + p.b[1] * y1 + p.b[2] * y2 - p.a[0] * z1 - p.a[1] * z2;
      y2 = y1; y1 = y; z2 = z1; z1 = z;
      acc += z * z;
    }
    out[seg] = acc;
  }
  return out;
}

// Channel weights: L, R, C = 1, LFE ignored, surrounds 1.41 (5.1 order L R C LFE Ls Rs).
const weight = (c, n) => (n >= 6 ? [1, 1, 1, 0, 1.41, 1.41][c] ?? 1 : 1);

function gated(blocks, relGateLU) {
  const abs = blocks.filter(l => l > -70);
  if (!abs.length) return { list: [], gate: -Infinity };
  const mean = 10 * Math.log10(abs.reduce((a, l) => a + 10 ** (l / 10), 0) / abs.length);
  const gate = mean + relGateLU;
  return { list: abs.filter(l => l > gate), gate };
}

export function loudness(buf) {
  const fs = buf.sampleRate, hop = Math.round(fs * 0.1);
  const ch = channelsOf(buf);
  const segs = ch.map(x => segmentPower(x, fs, hop));
  const nSeg = segs[0]?.length || 0;
  const combined = new Float64Array(nSeg);
  ch.forEach((_, c) => { const w = weight(c, ch.length); for (let i = 0; i < nSeg; i++) combined[i] += w * segs[c][i]; });
  const blockL = (len) => {
    const out = [];
    for (let i = 0; i + len <= nSeg; i++) {
      let s = 0;
      for (let j = 0; j < len; j++) s += combined[i + j];
      out.push(-0.691 + 10 * Math.log10(s / (len * hop) || 1e-30));
    }
    return out;
  };
  const momentary = blockL(4);                  // 400 ms blocks, 100 ms apart (75 % overlap)
  const { list } = gated(momentary, -10);
  const integrated = list.length
    ? -0.691 + 10 * Math.log10(list.reduce((a, l) => a + 10 ** ((l + 0.691) / 10), 0) / list.length)
    : -Infinity;
  const short = blockL(30);                     // 3 s windows
  const st = gated(short, -20).list.sort((a, b) => a - b);
  const pct = q => st[Math.min(st.length - 1, Math.max(0, Math.round(q * (st.length - 1))))];
  const lra = st.length > 1 ? pct(0.95) - pct(0.10) : 0;
  return {
    integrated,
    lra,
    momentaryMax: momentary.length ? Math.max(...momentary) : -Infinity,
    shortMax: short.length ? Math.max(...short) : -Infinity,
  };
}

// Windowed-sinc 4× interpolator (12 taps per phase), as BS.1770 Annex 2 suggests.
const TP = (() => {
  const phases = [];
  for (let p = 1; p < 4; p++) {
    const t = p / 4, taps = [];
    let sum = 0;
    for (let m = -5; m <= 6; m++) {
      const x = t - m;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / 6.5);
      taps.push(sinc * w); sum += sinc * w;
    }
    phases.push(taps.map(v => v / sum));
  }
  return phases;
})();

export function truePeak(buf) {
  let peak = 0;
  for (const x of channelsOf(buf)) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
    }
    if (buf.sampleRate >= 176400) continue;
    // Only look between samples near loud spots — inter-sample peaks can't
    // exceed the neighbourhood by more than a few dB.
    const floor = peak * 0.5;
    for (let i = 5; i < n - 6; i++) {
      if (Math.abs(x[i]) < floor && Math.abs(x[i + 1]) < floor) continue;
      for (const taps of TP) {
        let y = 0;
        for (let k = 0; k < 12; k++) y += taps[k] * x[i - 5 + k];
        const a = Math.abs(y);
        if (a > peak) peak = a;
      }
    }
  }
  return peak;
}

// Everything the Atlas shows.
export function measure(buf) {
  let peak = 0, sumSq = 0, clipped = 0, clipRuns = 0, dc = 0;
  const ch = channelsOf(buf);
  const FULL = 32766 / 32768;
  for (const x of ch) {
    let run = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i], a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v; dc += v;
      if (a >= FULL) { clipped++; if (++run === 3) clipRuns++; } else run = 0;
    }
  }
  const total = Math.max(1, ch.length * buf.length);
  const L = loudness(buf);
  return {
    peak, peakDb: db(peak),
    truePeakDb: db(truePeak(buf)),
    rmsDb: db(Math.sqrt(sumSq / total)),
    dcOffset: dc / total,
    clipped, clipRuns,
    lufs: L.integrated, lra: L.lra, momentaryMax: L.momentaryMax, shortMax: L.shortMax,
  };
}

// Applies gain, then a smooth look-ahead limiter so no sample passes `ceilingLin`.
function gainAndLimit(ch, rate, gain, ceilingLin) {
  const n = ch[0].length;
  const need = new Float32Array(n);
  let limited = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const x of ch) { const a = Math.abs(x[i] * gain); if (a > m) m = a; }
    need[i] = m > ceilingLin ? ceilingLin / m : 1;
    if (m > ceilingLin) limited++;
  }
  const out = ch.map(x => { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[i] * gain; return y; });
  if (!limited) return { out, limited };
  const L = Math.max(1, Math.round(rate * 0.0015));          // 1.5 ms look-ahead
  // Minimum over ±L, then a moving average over ±L/2: stays below `need` and has no steps.
  const mn = new Float32Array(n);
  const dq = new Int32Array(n + 2 * L + 2); let hd = 0, tl = 0;
  for (let j = 0, i = -L; i < n; j++, i++) {
    if (j < n) { while (tl > hd && need[dq[tl - 1]] >= need[j]) tl--; dq[tl++] = j; }
    if (i >= 0) { while (dq[hd] < i - L) hd++; mn[i] = need[dq[hd]]; }
  }
  const H = Math.max(1, L >> 1), sm = new Float32Array(n), P = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) P[i + 1] = P[i] + mn[i];
  for (let i = 0; i < n; i++) {
    const lo = i - H, hi = i + H;                       // outside the file counts as "no limiting" (1)
    const inside = P[Math.min(n, hi + 1)] - P[Math.max(0, lo)];
    const outside = Math.max(0, -lo) + Math.max(0, hi - (n - 1));
    sm[i] = (inside + outside) / (2 * H + 1);
  }
  // Release: come back up slowly (~80 ms) so the limiter doesn't pump.
  const rel = 1 - Math.exp(-1 / (rate * 0.08));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(sm[i], need[i], g + (1 - g) * rel);
    for (const y of out) y[i] *= g;
  }
  return { out, limited };
}

// Normalise to `target` LUFS with a true-peak ceiling (dBTP). Returns the new
// buffer plus before/after readings.
export function normalise(buf, { target = -16, peak = -1 } = {}) {
  const before = measure(buf);
  if (!isFinite(before.lufs)) throw new Error('This is silent (or under 0.4 s) — there is no loudness to measure');
  const gainDb = target - before.lufs;
  const ceiling = 10 ** (peak / 20);
  let { out, limited } = gainAndLimit(channelsOf(buf), buf.sampleRate, 10 ** (gainDb / 20), ceiling);
  let res = makeBuffer(out, buf.sampleRate);
  // The limiter works on samples; trim a little more if peaks between samples still poke over.
  let tp = truePeak(res), trim = 0;
  if (tp > ceiling) {
    trim = db(ceiling / tp) - 0.05;
    const f = 10 ** (trim / 20);
    out = out.map(y => y.map(v => v * f));
    res = makeBuffer(out, buf.sampleRate);
  }
  const after = measure(res);
  return { buffer: res, before, after, gainDb, limitedSamples: limited, trimDb: trim };
}

export { db };
