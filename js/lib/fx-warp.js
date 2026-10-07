// Perspective flattening for the image de-skewer. Pure maths plus one canvas
// pass; no screen needed.
import { canvas, ctx2d } from './fx-core.js';

// Projective map from the unit square to a quad (tl, tr, br, bl), after
// Heckbert's "Fundamentals of Texture Mapping". Returns (u, v) → [x, y].
export function squareToQuad([p0, p1, p2, p3]) {
  const [x0, y0] = p0, [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g = 0, h = 0;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  const m = { a, b, c, d, e, f, g, h };
  const map = (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
  map.m = m;
  return map;
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// Natural output size for a quad: the longer of each pair of opposite edges.
export function quadSize([tl, tr, br, bl]) {
  return [Math.round(Math.max(dist(tl, tr), dist(bl, br))), Math.round(Math.max(dist(tl, bl), dist(tr, br)))];
}

// Is the quad usable (convex, corners in order, not tiny)?
export function quadOk(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-6) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  const [w, h] = quadSize(q);
  return w >= 4 && h >= 4;
}

// Flattens the quad from src (ImageData) into a W×H canvas, bilinear sampling.
export function warp(src, quad, W, H) {
  const map = squareToQuad(quad);
  const out = canvas(W, H), ox = ctx2d(out, true);
  const od = ox.createImageData(out.width, out.height), o = od.data;
  const s = src.data, sw = src.width, sh = src.height;
  const { a, b, c, d, e, f, g, h } = map.m;
  W = out.width; H = out.height;
  let k = 0;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++, k += 4) {
      const u = (x + 0.5) / W;
      const w = g * u + h * v + 1;
      let sx = (a * u + b * v + c) / w - 0.5, sy = (d * u + e * v + f) / w - 0.5;
      if (sx < 0) sx = 0; else if (sx > sw - 1) sx = sw - 1;
      if (sy < 0) sy = 0; else if (sy > sh - 1) sy = sh - 1;
      const x0 = sx | 0, y0 = sy | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = s[i00 + ch] + (s[i10 + ch] - s[i00 + ch]) * fx;
        const bot = s[i01 + ch] + (s[i11 + ch] - s[i01 + ch]) * fx;
        o[k + ch] = top + (bot - top) * fy;
      }
    }
  }
  ox.putImageData(od, 0, 0);
  return out;
}
