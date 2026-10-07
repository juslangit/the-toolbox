// Canvas work for the image-effects tools (js/tools/imagefx.js). Everything
// here works without anything on screen, so the workflow steps can use it too.

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export const ctx2d = (c, read = false) => c.getContext('2d', read ? { willReadFrequently: true } : undefined);

// Decodes a File/Blob into something drawImage takes. Width/height on .w/.h.
export async function decode(file) {
  let img;
  if (typeof createImageBitmap === 'function') {
    try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  if (!img) {
    const url = URL.createObjectURL(file);
    try {
      img = new Image();
      img.src = url;
      await img.decode();
    } catch {
      throw new Error(`Could not read “${file.name || 'that file'}” as a picture`);
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
  img.w = img.naturalWidth || img.width;
  img.h = img.naturalHeight || img.height;
  return img;
}

export function toBlob(c, type = 'image/png', quality = 0.92) {
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('The browser could not save the picture (too big?)')), type, quality));
}

export async function toFile(c, name, type = 'image/png', quality) {
  return new File([await toBlob(c, type, quality)], name, { type });
}

// Name with a suffix and new extension: photo.jpg → photo-matte.png
export const outName = (name, suffix, ext = 'png') => (name || 'image').replace(/\.[^.]+$/, '') + suffix + '.' + ext;

// Keeps the type for JPEG/WebP when nothing needs transparency.
export const keepType = f => (/^image\/(jpeg|webp)$/.test(f.type) ? f.type : 'image/png');
export const extOf = type => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] || 'png');

// Largest side the effects work at — big enough for print, small enough for phones.
export const MAX_SIDE = 8000;
export function fitMax(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// Even blur that works everywhere. Canvas filters where the browser has them
// (Safari 17 does not); otherwise halve the size step by step and grow it back,
// which averages neighbouring pixels much like a blur.
const hasFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
export function softBlur(img, w, h, strength = 24, forcePyramid = false) {
  const out = canvas(w, h), ox = ctx2d(out);
  const r = Math.max(w, h) / strength;
  if (hasFilter && !forcePyramid) {
    ox.filter = `blur(${r.toFixed(1)}px)`;
    // Draw a little bigger so the edges do not fade to transparent.
    ox.drawImage(img, -r * 2, -r * 2, w + r * 4, h + r * 4);
    ox.filter = 'none';
    return out;
  }
  const target = Math.max(4, Math.max(w, h) / (r * 2));
  let cur = img, cw = w, ch = h;
  const steps = [];
  while (Math.max(cw, ch) / 2 >= target) {
    cw = Math.max(1, Math.round(cw / 2)); ch = Math.max(1, Math.round(ch / 2));
    const c = canvas(cw, ch), x = ctx2d(c);
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, cw, ch);
    steps.push(c); cur = c;
  }
  // Grow back through the same sizes, so each step only doubles.
  for (let i = steps.length - 2; i >= 0; i--) {
    const c = canvas(steps[i].width, steps[i].height), x = ctx2d(c);
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(cur, 0, 0, w, h);
  return out;
}

// Draws img covering (w,h), centred on (fx, fy) in 0..1.
export function drawCover(x, img, w, h, fx = 0.5, fy = 0.5, zoom = 1) {
  const iw = img.w || img.width, ih = img.h || img.height;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  x.drawImage(img, (w - dw) * fx, (h - dh) * fy, dw, dh);
}

// --- matte --------------------------------------------------------------------
export const RATIOS = { '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16], '16:9': [16, 9] };

// Picture on a canvas of a set shape. bg: 'colour' | 'blur' | 'none'.
export function matte(img, { ratio = '1:1', colour = '#ffffff', padding = 6, bg = 'colour' } = {}) {
  const [rw, rh] = RATIOS[ratio] || RATIOS['1:1'];
  const iw = img.w || img.width, ih = img.h || img.height;
  const p = Math.max(0, Math.min(40, +padding || 0)) / 100;
  const innerW = Math.max(iw, ih * rw / rh), innerH = innerW * rh / rw;
  let W = innerW / (1 - 2 * p), H = innerH / (1 - 2 * p);
  const s = Math.min(1, MAX_SIDE / Math.max(W, H));
  W = Math.round(W * s); H = Math.round(H * s);
  const c = canvas(W, H), x = ctx2d(c);
  if (bg === 'blur') {
    const cover = canvas(W, H);
    drawCover(ctx2d(cover), img, W, H);
    x.drawImage(softBlur(cover, W, H, 30), 0, 0);
    x.fillStyle = 'rgba(0,0,0,.12)';
    x.fillRect(0, 0, W, H);
  } else if (bg !== 'none') {
    x.fillStyle = colour;
    x.fillRect(0, 0, W, H);
  }
  const dw = iw * s, dh = ih * s;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, Math.round((W - dw) / 2), Math.round((H - dh) / 2), Math.round(dw), Math.round(dh));
  return c;
}

// --- seamless carousel ----------------------------------------------------------
// Cuts img into n slides of ratio (w:h) that line up edge to edge.
export function carousel(img, { n = 3, ratio = '1:1', width = 1080, pos = 50 } = {}) {
  const [rw, rh] = RATIOS[ratio] || RATIOS['1:1'];
  const sw = width, sh = Math.round(width * rh / rw);
  const strip = canvas(sw * n, sh), x = ctx2d(strip);
  x.imageSmoothingQuality = 'high';
  const f = Math.max(0, Math.min(100, pos)) / 100;
  drawCover(x, img, strip.width, strip.height, f, f);
  const slides = [];
  for (let i = 0; i < n; i++) {
    const c = canvas(sw, sh);
    ctx2d(c).drawImage(strip, i * sw, 0, sw, sh, 0, 0, sw, sh);
    slides.push(c);
  }
  return { strip, slides };
}

// --- watermark ------------------------------------------------------------------
export const SPOTS = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] };
const FONTS = {
  sans: '700 100px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: '700 100px Georgia, "Times New Roman", serif',
  mono: '700 100px ui-monospace, Menlo, Consolas, monospace',
};

// Draws a text or logo mark. size = mark width as % of the picture width.
// opts: { text, logo, position, opacity, size, rotation, colour, font, outline }
export function watermark(img, opts = {}) {
  const { text = '', logo = null, position = 'br', opacity = 0.6, size = 25, rotation = 0,
    colour = '#ffffff', font = 'sans', outline = true } = opts;
  const iw = img.w || img.width, ih = img.h || img.height;
  const [W, H] = fitMax(iw, ih);
  const c = canvas(W, H), x = ctx2d(c);
  x.drawImage(img, 0, 0, W, H);
  if (!logo && !String(text).trim()) return c;

  // The mark, drawn once on its own canvas.
  let mark;
  const targetW = Math.max(8, W * Math.max(1, Math.min(100, +size || 25)) / 100);
  if (logo) {
    const lw = logo.w || logo.width, lh = logo.h || logo.height;
    let mw = targetW, mh = lh * mw / lw;
    if (position !== 'tile' && mh > H * 0.6) { mh = H * 0.6; mw = lw * mh / lh; }
    mark = canvas(mw, mh);
    const mx = ctx2d(mark);
    mx.imageSmoothingQuality = 'high';
    mx.drawImage(logo, 0, 0, mark.width, mark.height);
  } else {
    const probe = ctx2d(canvas(1, 1));
    probe.font = FONTS[font] || FONTS.sans;
    const tw = probe.measureText(text).width || 1;
    let px = 100 * targetW / tw;
    if (position !== 'tile') px = Math.min(px, H * 0.25);
    px = Math.max(6, px);
    const f = (FONTS[font] || FONTS.sans).replace('100px', `${px.toFixed(1)}px`);
    probe.font = f;
    const pad = Math.ceil(px * 0.25);
    mark = canvas(probe.measureText(text).width + pad * 2, px * 1.3 + pad * 2);
    const mx = ctx2d(mark);
    mx.font = f;
    mx.textBaseline = 'middle';
    mx.fillStyle = colour;
    if (outline) {
      mx.shadowColor = luminance(colour) > 0.5 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.55)';
      mx.shadowBlur = Math.max(1, px * 0.08);
    }
    mx.fillText(text, pad, mark.height / 2);
  }

  x.globalAlpha = Math.max(0, Math.min(1, +opacity));
  const rad = (+rotation || 0) * Math.PI / 180;
  const margin = Math.round(Math.min(W, H) * 0.03);
  if (position === 'tile') {
    const stepX = mark.width * 1.6, stepY = mark.height * 2.6;
    const diag = Math.hypot(W, H);
    x.save();
    x.translate(W / 2, H / 2);
    x.rotate(rad);
    let r = 0;
    for (let y = -diag / 2; y < diag / 2; y += stepY, r++) {
      for (let xx = -diag / 2 + (r % 2 ? stepX / 2 : 0); xx < diag / 2; xx += stepX) x.drawImage(mark, xx, y);
    }
    x.restore();
  } else {
    const [fx, fy] = SPOTS[position] || SPOTS.br;
    // Bounding box of the rotated mark, so it stays inside the margin.
    const bw = Math.abs(mark.width * Math.cos(rad)) + Math.abs(mark.height * Math.sin(rad));
    const bh = Math.abs(mark.width * Math.sin(rad)) + Math.abs(mark.height * Math.cos(rad));
    const cx = margin + bw / 2 + (W - 2 * margin - bw) * fx;
    const cy = margin + bh / 2 + (H - 2 * margin - bh) * fy;
    x.save();
    x.translate(cx, cy);
    x.rotate(rad);
    x.drawImage(mark, -mark.width / 2, -mark.height / 2);
    x.restore();
  }
  x.globalAlpha = 1;
  return c;
}

export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

// --- grain ----------------------------------------------------------------------
// Small seeded random numbers, so the preview and the saved file match.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// amount 0..100, size 1..8 (grain size in pixels), mono: same noise on R, G and B.
export function grain(img, { amount = 25, size = 1, mono = true, seed = 7 } = {}) {
  const iw = img.w || img.width, ih = img.h || img.height;
  const [W, H] = fitMax(iw, ih);
  const c = canvas(W, H), x = ctx2d(c, true);
  x.drawImage(img, 0, 0, W, H);
  const k = Math.max(0, Math.min(100, +amount)) / 100 * 1.1;
  if (!k) return c;
  const s = Math.max(1, Math.min(8, +size || 1));
  const nw = Math.ceil(W / s), nh = Math.ceil(H / s);
  // Noise centred on 128, drawn small and grown with smoothing for bigger grain.
  const n = canvas(nw, nh), nx = ctx2d(n, true);
  const nd = nx.createImageData(nw, nh), r = rng(seed);
  const g = () => (r() + r() + r() - 1.5) * 2; // roughly normal, -3..3
  for (let i = 0; i < nd.data.length; i += 4) {
    const a = g();
    nd.data[i] = 128 + a * 40;
    nd.data[i + 1] = 128 + (mono ? a : g()) * 40;
    nd.data[i + 2] = 128 + (mono ? a : g()) * 40;
    nd.data[i + 3] = 255;
  }
  nx.putImageData(nd, 0, 0);
  let field = n;
  if (s > 1) {
    field = canvas(W, H);
    const fx = ctx2d(field, true);
    fx.imageSmoothingEnabled = true;
    fx.drawImage(n, 0, 0, nw * s, nh * s);
  }
  const fd = ctx2d(field, true).getImageData(0, 0, W, H).data;
  const id = x.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const w = k * (0.55 + 0.45 * (1 - Math.abs(2 * l - 1))); // film grain shows most in the mid-tones
    d[i] += (fd[i] - 128) * w;
    d[i + 1] += (fd[i + 1] - 128) * w;
    d[i + 2] += (fd[i + 2] - 128) * w;
  }
  x.putImageData(id, 0, 0);
  return c;
}

// --- shapes for the masker ---------------------------------------------------------
export const SHAPES = [['circle', 'Circle'], ['rounded', 'Rounded square'], ['squircle', 'Squircle'], ['hexagon', 'Hexagon'],
  ['star', 'Star'], ['heart', 'Heart'], ['blob', 'Blob']];

// Adds the shape's outline to ctx as a path inside a size×size box.
export function shapePath(x, shape, S, seed = 1) {
  const c = S / 2;
  x.beginPath();
  if (shape === 'circle') x.arc(c, c, c, 0, Math.PI * 2);
  else if (shape === 'rounded') {
    const r = S * 0.18;
    x.moveTo(r, 0); x.arcTo(S, 0, S, S, r); x.arcTo(S, S, 0, S, r); x.arcTo(0, S, 0, 0, r); x.arcTo(0, 0, S, 0, r);
  } else if (shape === 'squircle') {
    // Superellipse |x|^n + |y|^n = 1 with n = 5.
    const n = 5, steps = 240;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const px = c + c * Math.sign(ct) * Math.abs(ct) ** (2 / n), py = c + c * Math.sign(st) * Math.abs(st) ** (2 / n);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
  } else if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = c + c * Math.cos(a), py = c + c * Math.sin(a);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
  } else if (shape === 'star') {
    const outer = c, inner = c * 0.45, cy = c * 1.06;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? inner : outer;
      const px = c + r * Math.cos(a), py = cy + r * Math.sin(a);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
  } else if (shape === 'heart') {
    // Classic parametric heart, scaled to fill the box.
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200 * Math.PI * 2;
      pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = S / Math.max(maxX - minX, maxY - minY);
    const ox = (S - (maxX - minX) * k) / 2, oy = (S - (maxY - minY) * k) / 2;
    pts.forEach(([px, py], i) => {
      const X = ox + (px - minX) * k, Y = oy + (py - minY) * k;
      i ? x.lineTo(X, Y) : x.moveTo(X, Y);
    });
  } else { // blob: a smooth wobbly circle; seed picks the wobble
    const r = rng(seed * 9973 + 1), k = 8;
    const rad = Array.from({ length: k }, () => 0.78 + r() * 0.22);
    const pts = rad.map((m, i) => { const a = i / k * Math.PI * 2; return [c + c * m * Math.cos(a), c + c * m * Math.sin(a)]; });
    // Catmull-Rom through the points as Béziers.
    for (let i = 0; i < k; i++) {
      const p0 = pts[(i - 1 + k) % k], p1 = pts[i], p2 = pts[(i + 1) % k], p3 = pts[(i + 2) % k];
      if (!i) x.moveTo(p1[0], p1[1]);
      x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  x.closePath();
}

// Cuts a square from img (cover, at fx/fy, zoom) into shape. outline: {colour, width%}.
export function maskShape(img, { shape = 'circle', fx = 0.5, fy = 0.5, zoom = 1, seed = 1, outline = 0, outlineColour = '#ffffff', max = 4096 } = {}) {
  const iw = img.w || img.width, ih = img.h || img.height;
  const S = Math.min(max, Math.min(iw, ih));
  const c = canvas(S, S), x = ctx2d(c);
  const ow = S * Math.max(0, +outline || 0) / 100;
  x.save();
  if (ow) { x.translate(ow / 2, ow / 2); x.scale((S - ow) / S, (S - ow) / S); }
  shapePath(x, shape, S, seed);
  x.restore();
  x.save();
  x.clip();
  x.imageSmoothingQuality = 'high';
  drawCover(x, img, S, S, fx, fy, zoom);
  x.restore();
  if (ow) {
    x.save();
    x.translate(ow / 2, ow / 2); x.scale((S - ow) / S, (S - ow) / S);
    shapePath(x, shape, S, seed);
    x.restore();
    x.lineWidth = ow;
    x.lineJoin = 'round';
    x.strokeStyle = outlineColour;
    x.stroke();
  }
  return c;
}
