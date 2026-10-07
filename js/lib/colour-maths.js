// Colour maths shared by the Colour drawer. No DOM needed except the last-resort
// parser fallback. A colour is { r, g, b, a } with r/g/b in 0..1 (gamma-encoded
// sRGB) and a in 0..1. Everything else (OKLab, LCH, CMYK…) is converted on demand.
// Formulas: CSS Color 4 (sRGB, HWB, Lab/LCH D50, OKLab), WCAG 2.2 relative
// luminance, APCA 0.0.98G (SAPC constants), CIEDE2000, Machado et al. 2009 CVD.

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
const mod = (v, m) => ((v % m) + m) % m;
export { clamp, round };

// --- sRGB transfer ---------------------------------------------------------
export const toLinear = v => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
export const toGamma = v => (Math.abs(v) <= 0.0031308 ? v * 12.92 : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055));
export const linearRgb = c => [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
export const fromLinear = ([r, g, b], a = 1) => ({ r: toGamma(r), g: toGamma(g), b: toGamma(b), a });

// --- hex -------------------------------------------------------------------
const hx = v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
export function toHex(c, withAlpha = false) {
  return '#' + hx(c.r) + hx(c.g) + hx(c.b) + (withAlpha && c.a < 1 ? hx(c.a) : '');
}
export function fromHex(s) {
  let m = s.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(m)) return null;
  if (m.length <= 4) m = [...m].map(ch => ch + ch).join('');
  const n = i => parseInt(m.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: m.length === 8 ? n(6) : 1 };
}
export const rgb255 = c => [c.r, c.g, c.b].map(v => Math.round(clamp(v) * 255));

// --- HSL / HSV / HWB ---------------------------------------------------------
export function toHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
export function fromHsl(h, s, l, a = 1) {
  s = clamp(s / 100); l = clamp(l / 100); h = mod(h, 360);
  const f = n => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return { r: f(0), g: f(8), b: f(4), a };
}
export function toHsv({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const [h] = toHsl({ r, g, b });
  return [h, max ? (max - min) / max * 100 : 0, max * 100];
}
export function fromHsv(h, s, v, a = 1) {
  s = clamp(s / 100); v = clamp(v / 100);
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return fromHsl(h, sl * 100, l * 100, a);
}
export function toHwb(c) {
  const [h] = toHsl(c);
  return [h, Math.min(c.r, c.g, c.b) * 100, (1 - Math.max(c.r, c.g, c.b)) * 100];
}
export function fromHwb(h, w, bl, a = 1) {
  w /= 100; bl /= 100;
  if (w + bl >= 1) { const g = w / (w + bl); return { r: g, g, b: g, a }; }
  const p = fromHsl(h, 100, 50);
  const f = v => v * (1 - w - bl) + w;
  return { r: f(p.r), g: f(p.g), b: f(p.b), a };
}

// --- OKLab / OKLCH -----------------------------------------------------------
export function toOklab(c) {
  const [r, g, b] = linearRgb(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
export function fromOklabRaw(L, A, B, a = 1) { // may be out of gamut
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return fromLinear([
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ], a);
}
export function toOklch(c) {
  const [L, A, B] = toOklab(c);
  const C = Math.hypot(A, B);
  return [L, C, C < 1e-4 ? 0 : mod(Math.atan2(B, A) * 180 / Math.PI, 360)];
}
const rad = d => d * Math.PI / 180;
export const inGamut = (c, eps = 1e-4) => [c.r, c.g, c.b].every(v => v >= -eps && v <= 1 + eps);
export const clip = c => ({ r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a: c.a ?? 1 });

// OKLCH → sRGB, pulling chroma in (keeping lightness and hue) until it fits.
export function fromOklch(L, C, H, a = 1) {
  L = clamp(L);
  const at = cc => fromOklabRaw(L, cc * Math.cos(rad(H)), cc * Math.sin(rad(H)), a);
  let c = at(C);
  if (inGamut(c)) return clip(c);
  let lo = 0, hi = C;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid; else hi = mid;
  }
  return clip(at(lo));
}
export function fromOklab(L, A, B, a = 1) {
  const c = fromOklabRaw(L, A, B, a);
  if (inGamut(c)) return clip(c);
  return fromOklch(L, Math.hypot(A, B), Math.atan2(B, A) * 180 / Math.PI, a);
}
// Largest chroma that still fits sRGB at this lightness and hue.
export function maxChroma(L, H) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(fromOklabRaw(L, mid * Math.cos(rad(H)), mid * Math.sin(rad(H))))) lo = mid; else hi = mid;
  }
  return lo;
}

// --- CIE XYZ, Lab, LCH (D50, as CSS) -----------------------------------------
const mul = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const SRGB_XYZ65 = [[0.41239079926595934, 0.357584339383878, 0.1804807884018343], [0.21263900587151027, 0.715168678767756, 0.07219231536073371], [0.01933081871559182, 0.11919477979462598, 0.9505321522496607]];
const XYZ65_SRGB = [[3.2409699419045226, -1.537383177570094, -0.4986107602930034], [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559], [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]];
const D65_D50 = [[1.0479298208405488, 0.022946793341019088, -0.05019222954313557], [0.029627815688159344, 0.990434484573249, -0.01707382502938514], [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008]];
const D50_D65 = [[0.9554734527042182, -0.023098536874261423, 0.0632593086610217], [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008], [0.012314001688319899, -0.020507696433477912, 1.3303659366080753]];
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const EPS = 216 / 24389, KAP = 24389 / 27;
export const toXyz65 = c => mul(SRGB_XYZ65, linearRgb(c));
export function toLab(c) {
  const xyz = mul(D65_D50, toXyz65(c)).map((v, i) => v / D50[i]);
  const f = xyz.map(v => (v > EPS ? Math.cbrt(v) : (KAP * v + 16) / 116));
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
export function fromLab(L, A, B, a = 1) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const xyz = [fx ** 3 > EPS ? fx ** 3 : (116 * fx - 16) / KAP, L > KAP * EPS ? fy ** 3 : L / KAP, fz ** 3 > EPS ? fz ** 3 : (116 * fz - 16) / KAP].map((v, i) => v * D50[i]);
  return fromLinear(mul(XYZ65_SRGB, mul(D50_D65, xyz)), a);
}
export function toLch(c) {
  const [L, A, B] = toLab(c);
  const C = Math.hypot(A, B);
  return [L, C, C < 0.01 ? 0 : mod(Math.atan2(B, A) * 180 / Math.PI, 360)];
}
export const fromLch = (L, C, H, a = 1) => fromLab(L, C * Math.cos(rad(H)), C * Math.sin(rad(H)), a);

// --- CMYK (naive, device-independent — real print needs an ICC profile) ------
export function toCmyk({ r, g, b }) {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => v * 100);
}
export const fromCmyk = (c, m, y, k, a = 1) => ({ r: (1 - c / 100) * (1 - k / 100), g: (1 - m / 100) * (1 - k / 100), b: (1 - y / 100) * (1 - k / 100), a });

// --- contrast ----------------------------------------------------------------
export const luminance = c => { const [r, g, b] = linearRgb(clip(c)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Two decimals, but never rounded up across a pass mark (4.497 shows 4.49, not 4.50).
export const ratioText = r => { let t = Math.round(r * 100) / 100; if ([3, 4.5, 7].some(x => r < x && t >= x)) t = Math.floor(r * 100) / 100; return t.toFixed(2) + ":1"; };
export function wcag(ratio) {
  return { normalAA: ratio >= 4.5, normalAAA: ratio >= 7, largeAA: ratio >= 3, largeAAA: ratio >= 4.5, ui: ratio >= 3 };
}
// APCA (Accessible Perceptual Contrast Algorithm) 0.0.98G-4g constants.
export function apca(text, bg) {
  const Y = c => {
    const [r, g, b] = [c.r, c.g, c.b].map(v => clamp(v) ** 2.4);
    let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    return y > 0.022 ? y : y + (0.022 - y) ** 1.414;
  };
  const yt = Y(text), yb = Y(bg);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; out = s < 0.1 ? 0 : s - 0.027; }
  else { const s = (yb ** 0.65 - yt ** 0.62) * 1.14; out = s > -0.1 ? 0 : s + 0.027; }
  return out * 100;
}
export function apcaSays(lc) {
  const a = Math.abs(lc);
  return a >= 90 ? 'Great for body text' : a >= 75 ? 'Fine for body text' : a >= 60 ? 'OK for content text, not small body text'
    : a >= 45 ? 'Large or bold text only' : a >= 30 ? 'Non-text parts and placeholder text only' : a >= 15 ? 'Barely visible — dividers at most' : 'Not readable';
}
// Readable ink (black or white) on a background.
export const inkOn = bg => (contrast(bg, { r: 0, g: 0, b: 0 }) >= contrast(bg, { r: 1, g: 1, b: 1 }) ? '#000000' : '#ffffff');

// --- difference ----------------------------------------------------------------
export function deltaEOk(a, b) { const p = toOklab(a), q = toOklab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
export function deltaE2000(c1, c2) {
  const [L1, a1, b1] = toLab(c1), [L2, a2, b2] = toLab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G);
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (a === 0 && b === 0 ? 0 : mod(Math.atan2(b, a) * 180 / Math.PI, 360));
  const h1 = hp(b1, ap1), h2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dh / 2));
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = h1 + h2;
  if (Cp1 * Cp2) { if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTh)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

// --- CSS named colours (CSS Color 4 list) -------------------------------------
const NAMED_SRC = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32';
export const NAMED = {};
{ const p = NAMED_SRC.split(' '); for (let i = 0; i < p.length; i += 2) NAMED[p[i]] = '#' + p[i + 1]; }
// One name per hex for "nearest name" (prefer gray over grey, cyan/magenta over aqua/fuchsia).
const NAME_LIST = Object.entries(NAMED).filter(([n]) => !/grey|^aqua$|^fuchsia$/.test(n)).map(([n, hex]) => ({ n, c: fromHex(hex), lab: toOklab(fromHex(hex)) }));
export function nearestName(c) {
  const p = toOklab(c);
  let best = null, bd = Infinity;
  for (const e of NAME_LIST) {
    const d = Math.hypot(p[0] - e.lab[0], p[1] - e.lab[1], p[2] - e.lab[2]);
    if (d < bd) { bd = d; best = e; }
  }
  return { name: best.n, hex: toHex(best.c), exact: toHex(c) === toHex(best.c), deltaE: deltaE2000(c, best.c) };
}

// --- parsing -------------------------------------------------------------------
const num = (s, scale = 1) => { // "50%" → 0.5*scale-based percentages handled by caller
  s = s.trim();
  if (s === 'none') return 0;
  return s.endsWith('%') ? { pct: parseFloat(s) } : parseFloat(s);
};
const pct = (v, full) => (typeof v === 'object' ? v.pct / 100 * full : v);
function hue(s) {
  s = s.trim();
  const v = parseFloat(s);
  if (s.endsWith('turn')) return v * 360;
  if (s.endsWith('grad')) return v * 0.9;
  if (s.endsWith('rad')) return v * 180 / Math.PI;
  return s === 'none' ? 0 : v;
}
const alphaOf = s => (s == null ? 1 : clamp(pct(num(s), 1)));

// Any CSS colour (and a few friendly extras: bare hex, "255 0 0", cmyk()) → colour or null.
export function parse(str) {
  if (str == null) return null;
  if (typeof str === 'object' && 'r' in str) return str;
  let s = String(str).trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) return fromHex(NAMED[s]);
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hexc = fromHex(s);
  if (hexc && (s.startsWith('#') || /^[0-9a-f]{6}$/.test(s) || /^[0-9a-f]{3}$/.test(s) && /[a-f]/.test(s))) return hexc;
  const m = s.match(/^([a-z-]+)\((.*)\)$/);
  if (!m) {
    const bare = s.split(/[\s,]+/).map(Number);
    if (bare.length === 3 && bare.every(v => Number.isFinite(v) && v >= 0 && v <= 255)) return { r: bare[0] / 255, g: bare[1] / 255, b: bare[2] / 255, a: 1 };
    return fallback(str);
  }
  const fn = m[1];
  let body = m[2].trim(), alpha = null;
  if (body.includes('/')) { [body, alpha] = body.split('/').map(x => x.trim()); }
  let parts = body.split(/[\s,]+/).filter(Boolean);
  if (alpha == null && parts.length === 4 && fn !== 'cmyk' && fn !== 'device-cmyk' && fn !== 'color') alpha = parts.pop();
  if (alpha == null && parts.length === 5 && /cmyk/.test(fn)) alpha = parts.pop();
  const a = alphaOf(alpha);
  const P = parts.map(num);
  const ok = x => x && [x.r, x.g, x.b].every(Number.isFinite) ? x : null;
  try {
    switch (fn) {
      case 'rgb': case 'rgba': return ok({ r: pct(P[0], 255) / 255, g: pct(P[1], 255) / 255, b: pct(P[2], 255) / 255, a });
      case 'hsl': case 'hsla': return ok(fromHsl(hue(parts[0]), pct(P[1], 100) * (typeof P[1] === 'object' ? 1 : 1), pct(P[2], 100), a));
      case 'hwb': return ok(fromHwb(hue(parts[0]), pct(P[1], 100), pct(P[2], 100), a));
      case 'hsv': case 'hsb': return ok(fromHsv(hue(parts[0]), pct(P[1], 100), pct(P[2], 100), a));
      case 'lab': return ok(clip(fromLab(pct(P[0], 100), pct(P[1], 125), pct(P[2], 125), a)));
      case 'lch': return ok(clip(fromLch(pct(P[0], 100), pct(P[1], 150), hue(parts[2]), a)));
      case 'oklab': return ok(fromOklab(pct(P[0], 1), pct(P[1], 0.4), pct(P[2], 0.4), a));
      case 'oklch': return ok(fromOklch(pct(P[0], 1), pct(P[1], 0.4), hue(parts[2]), a));
      case 'cmyk': case 'device-cmyk': {
        const v = P.map(x => (typeof x === 'object' ? x.pct : x <= 1 ? x * 100 : x));
        return ok(fromCmyk(v[0], v[1], v[2], v[3], a));
      }
      case 'color': {
        const space = parts.shift();
        const v = parts.map(x => pct(num(x), 1));
        if (space === 'srgb') return ok(clip({ r: v[0], g: v[1], b: v[2], a }));
        if (space === 'srgb-linear') return ok(clip(fromLinear(v, a)));
        return fallback(str);
      }
    }
  } catch { /* fall through */ }
  return fallback(str);
}

// Anything else the browser understands (e.g. color(display-p3 …)): let canvas
// paint it into one sRGB pixel and read it back.
let probeCtx;
function fallback(str) {
  if (typeof document === 'undefined') return null;
  if (!probeCtx) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; probeCtx = cv.getContext('2d', { willReadFrequently: true }); }
  if (!(typeof CSS !== 'undefined' && CSS.supports('color', str))) return null;
  probeCtx.clearRect(0, 0, 1, 1);
  probeCtx.fillStyle = '#000';
  probeCtx.fillStyle = str;
  probeCtx.fillRect(0, 0, 1, 1);
  const d = probeCtx.getImageData(0, 0, 1, 1).data;
  return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
}
export const hexOf = s => { const c = parse(s); return c ? toHex(c) : null; };

// --- formatting ----------------------------------------------------------------
const A = c => (c.a != null && c.a < 1 ? ` / ${round(c.a * 100)}%` : '');
const n = (v, d) => String(round(v, d));
export function formats(c) {
  const [h, s, l] = toHsl(c), [hh, w, bl] = toHwb(c), [hv, sv, vv] = toHsv(c);
  const [L, C, H] = toOklch(c), [lL, la, lb] = toLab(c), [cL, cC, cH] = toLch(c);
  const [oL, oa, ob] = toOklab(c), [cc, cm, cy, ck] = toCmyk(c);
  const [R, G, B] = rgb255(c);
  return {
    HEX: toHex(c, true),
    RGB: `rgb(${R} ${G} ${B}${A(c)})`,
    HSL: `hsl(${n(h, 0)} ${n(s, 0)}% ${n(l, 0)}%${A(c)})`,
    HWB: `hwb(${n(hh, 0)} ${n(w, 0)}% ${n(bl, 0)}%${A(c)})`,
    HSV: `hsv(${n(hv, 0)} ${n(sv, 0)}% ${n(vv, 0)}%)`,
    OKLCH: `oklch(${n(L * 100, 1)}% ${n(C, 3)} ${n(H, 1)}${A(c)})`,
    OKLab: `oklab(${n(L * 100, 1)}% ${n(oa, 3)} ${n(ob, 3)}${A(c)})`,
    LAB: `lab(${n(lL, 1)}% ${n(la, 1)} ${n(lb, 1)}${A(c)})`,
    LCH: `lch(${n(cL, 1)}% ${n(cC, 1)} ${n(cH, 1)}${A(c)})`,
    CMYK: `cmyk(${n(cc, 0)}% ${n(cm, 0)}% ${n(cy, 0)}% ${n(ck, 0)}%)`,
  };
}
export const oklchCss = (L, C, H) => `oklch(${n(L * 100, 1)}% ${n(C, 3)} ${n(H, 1)})`;

// --- mixing ---------------------------------------------------------------------
export function mixOklab(a, b, t) {
  const p = toOklab(a), q = toOklab(b);
  return fromOklab(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, (a.a ?? 1) + ((b.a ?? 1) - (a.a ?? 1)) * t);
}
export function mixOklch(a, b, t) {
  const p = toOklch(a), q = toOklch(b);
  let h1 = p[2], h2 = q[2];
  if (p[1] < 0.002) h1 = h2; if (q[1] < 0.002) h2 = h1;
  let dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  return fromOklch(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, h1 + dh * t, (a.a ?? 1) + ((b.a ?? 1) - (a.a ?? 1)) * t);
}
export function mixSrgb(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: (a.a ?? 1) + ((b.a ?? 1) - (a.a ?? 1)) * t };
}
export const mix = { oklch: mixOklch, oklab: mixOklab, srgb: mixSrgb };
export const rotate = (c, deg) => { const [L, C, H] = toOklch(c); return fromOklch(L, C, H + deg, c.a); };
export const rotateHsl = (c, deg) => { const [h, s, l] = toHsl(c); return fromHsl(h + deg, s, l, c.a); };

// --- harmonies --------------------------------------------------------------------
export const HARMONIES = {
  complementary: { name: 'Complementary', angles: [0, 180] },
  split: { name: 'Split-complementary', angles: [0, 150, 210] },
  analogous: { name: 'Analogous', angles: [-30, 0, 30] },
  triadic: { name: 'Triadic', angles: [0, 120, 240] },
  tetradic: { name: 'Tetradic', angles: [0, 60, 180, 240] },
  square: { name: 'Square', angles: [0, 90, 180, 270] },
  monochrome: { name: 'Monochrome', angles: null },
};
// space: 'oklch' (even to the eye) or 'hsl' (the classic painter's wheel).
export function harmony(c, kind, space = 'oklch') {
  const def = HARMONIES[kind];
  if (!def.angles) {
    const [L, C, H] = toOklch(c);
    return [-0.3, -0.15, 0, 0.12, 0.24].map(d => {
      const l = clamp(L + d, 0.12, 0.97);
      return d === 0 ? clip(c) : fromOklch(l, C * (1 - Math.abs(d) * 0.8), H);
    }).sort((x, y) => toOklch(x)[0] - toOklch(y)[0]);
  }
  return def.angles.map(a => (a === 0 ? clip(c) : space === 'hsl' ? rotateHsl(c, a) : rotate(c, a)));
}

// --- Tailwind-style 50…950 scale (OKLCH) -------------------------------------------
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const L_TARGET = [0.975, 0.94, 0.885, 0.81, 0.715, 0.63, 0.545, 0.47, 0.395, 0.335, 0.255];
const C_SHAPE = [0.12, 0.26, 0.47, 0.72, 0.92, 1, 0.97, 0.86, 0.72, 0.6, 0.45];
// Returns { steps: [{step, colour, L, C, H}], baseStep } — the base lands on its nearest step, untouched.
export function tailwindScale(c, pin = 'auto') {
  const [L, C, H] = toOklch(c);
  let k = pin === 'auto' ? L_TARGET.reduce((bi, t, i) => (Math.abs(t - L) < Math.abs(L_TARGET[bi] - L) ? i : bi), 0) : STEPS.indexOf(+pin);
  if (k < 0) k = 5;
  const shift = L - L_TARGET[k];
  const cBase = C / C_SHAPE[k];
  const steps = STEPS.map((step, i) => {
    if (i === k) return { step, colour: clip(c), L, C, H };
    const w = Math.max(0, 1 - Math.abs(i - k) / 5);
    let l = clamp(L_TARGET[i] + shift * w, 0.08, 0.99);
    // Keep the order strictly monotonic around the pinned step.
    if (i < k) l = Math.max(l, L + 0.02 * (k - i)); else l = Math.min(l, L - 0.02 * (i - k));
    const cc = Math.min(cBase * C_SHAPE[i], maxChroma(l, H));
    const col = fromOklch(l, cc, H);
    const [l2, c2, h2] = toOklch(col);
    return { step, colour: col, L: l2, C: c2, H: c2 < 1e-4 ? H : h2 };
  });
  return { steps, baseStep: STEPS[k] };
}

// --- tints & shades -------------------------------------------------------------
export const tints = (c, n = 5) => Array.from({ length: n }, (_, i) => mixOklab(c, { r: 1, g: 1, b: 1, a: 1 }, (i + 1) / (n + 1)));
export const shades = (c, n = 5) => Array.from({ length: n }, (_, i) => mixOklab(c, { r: 0, g: 0, b: 0, a: 1 }, (i + 1) / (n + 1)));

// --- colour-vision deficiency (Machado, Oliveira & Fernandes 2009) ------------------
// Matrices act on linear RGB. "-anomaly" variants use the paper's severity 0.6.
export const CVD = {
  protanopia: { name: 'Protanopia', note: 'no red cones (~1% of men)', m: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] },
  deuteranopia: { name: 'Deuteranopia', note: 'no green cones (~1% of men)', m: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]] },
  tritanopia: { name: 'Tritanopia', note: 'no blue cones (rare)', m: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] },
  protanomaly: { name: 'Protanomaly', note: 'weak red (~1% of men)', m: [[0.385450, 0.769005, -0.154455], [0.100526, 0.829802, 0.069673], [-0.007442, -0.022190, 1.029632]] },
  deuteranomaly: { name: 'Deuteranomaly', note: 'weak green (~5% of men, the most common)', m: [[0.547494, 0.607765, -0.155259], [0.181692, 0.781742, 0.036566], [-0.010410, 0.027275, 0.983136]] },
  tritanomaly: { name: 'Tritanomaly', note: 'weak blue (rare)', m: [[1.104996, -0.046633, -0.058363], [-0.032137, 0.971635, 0.060503], [0.001336, 0.317922, 0.680742]] },
  achromatopsia: { name: 'Achromatopsia', note: 'no colour at all (very rare)', m: [[0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722], [0.2126, 0.7152, 0.0722]] },
  achromatomaly: { name: 'Achromatomaly', note: 'very weak colour (rare)', m: [[0.2126 * 0.6 + 0.4, 0.7152 * 0.6, 0.0722 * 0.6], [0.2126 * 0.6, 0.7152 * 0.6 + 0.4, 0.0722 * 0.6], [0.2126 * 0.6, 0.7152 * 0.6, 0.0722 * 0.6 + 0.4]] },
};
export function simulate(c, kind) {
  if (kind === 'normal' || !CVD[kind]) return clip(c);
  return clip(fromLinear(mul(CVD[kind].m, linearRgb(c)), c.a));
}

// --- random -----------------------------------------------------------------------
export function rng(seed = Date.now()) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
