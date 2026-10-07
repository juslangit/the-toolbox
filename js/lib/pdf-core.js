// PDF work shared by the PDF & print drawer (js/tools/pdf.js) and its workflow steps.
// pdf-lib (MIT) writes and edits; pdf.js (Apache-2.0) renders pages and reads text.
// Both are vendored and loaded only when a PDF tool needs them.

let libP, jsP;
export const pdfLib = () => (libP ||= import('../../vendor/pdf-lib.js'));
export function pdfjs() {
  return (jsP ||= import('../../vendor/pdfjs/pdf.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
    return m;
  }));
}

export const MM = 72 / 25.4;               // points per millimetre
export const SHEETS = {                    // portrait width × height in points
  a4: [595.28, 841.89], a3: [841.89, 1190.55], a5: [419.53, 595.28],
  letter: [612, 792], legal: [612, 1008], tabloid: [792, 1224],
};
export const SHEET_CHOICES = [['a4', 'A4'], ['a3', 'A3'], ['letter', 'US Letter'], ['tabloid', 'Tabloid (11 × 17 in)'], ['a5', 'A5'], ['legal', 'US Legal']];

export const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
export const bytesOf = async f => new Uint8Array(await f.arrayBuffer());
export const pdfFile = (bytes, name) => new File([bytes], name, { type: 'application/pdf' });
export const baseName = name => (name || 'document').replace(/\.[^.]+$/, '');

// Opens a PDF for editing. Encrypted files open (pdf-lib cannot decrypt them),
// so callers check doc.isEncrypted and warn.
export async function loadDoc(bytes) {
  const { PDFDocument } = await pdfLib();
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

// Opens a PDF for rendering. pdf.js moves the buffer into its worker, so it gets a copy.
export async function openView(bytes) {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    wasmUrl: new URL('../../vendor/pdfjs/wasm/', import.meta.url).href,
    iccUrl: new URL('../../vendor/pdfjs/iccs/', import.meta.url).href,
    isEvalSupported: false,
    enableXfa: false,
  });
  const doc = await task.promise;
  // pdf.js 6 frees a document through its loading task.
  if (typeof doc.destroy !== 'function') doc.destroy = () => task.destroy();
  return doc;
}

// The largest canvas iPhone Safari will draw is about 16.7 million pixels.
const MAX_PIXELS = 16_000_000, MAX_SIDE = 8000;
export function safeScale(w, h, scale) {
  let s = scale;
  if (w * s * h * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));
  if (Math.max(w, h) * s > MAX_SIDE) s = MAX_SIDE / Math.max(w, h);
  return s;
}

// Renders one page (pdf.js page object) into a new canvas. extraRotate adds to the page's own rotation.
export async function renderPage(page, { scale = 1, width, extraRotate = 0, background = 'white' } = {}) {
  const rotation = (page.rotate + extraRotate + 360) % 360;
  let vp = page.getViewport({ scale: 1, rotation });
  const s = safeScale(vp.width, vp.height, width ? width / vp.width : scale);
  vp = page.getViewport({ scale: s, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  await page.render({ canvas, viewport: vp, background }).promise;
  canvas.viewport = vp;
  canvas.usedScale = s;
  return canvas;
}

export const canvasBlob = (canvas, type = 'image/png', q) => new Promise((res, rej) =>
  canvas.toBlob(b => (b ? res(b) : rej(new Error('The browser could not encode the image'))), type, q));

// Text on a page, for checks and the preflight.
export async function pageText(view, n) {
  const tc = await (await view.getPage(n)).getTextContent();
  return tc.items.map(i => i.str).join(' ');
}

// "1-3, 5, 8-" → [[0,1,2],[4],[7,…,last]] (0-based, each range in order given).
export function parseRanges(text, count) {
  const out = [];
  for (const part of String(text).split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*(?:-|–|to)\s*(\d*)$/i) || part.match(/^(\d+)$/);
    if (!m) throw new Error(`“${part}” is not a page or range — use e.g. 1-3, 5, 8-`);
    let a, b;
    if (m.length === 2) a = b = +m[1];
    else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : count; }
    if (a < 1 || b < 1 || a > count || b > count) throw new Error(`“${part}” is outside pages 1–${count}`);
    const r = [];
    if (a <= b) for (let i = a; i <= b; i++) r.push(i - 1);
    else for (let i = a; i >= b; i--) r.push(i - 1);
    out.push(r);
  }
  if (!out.length) throw new Error('Type the pages to keep, e.g. 1-3, 5');
  return out;
}

export async function zipFiles(files) {
  const { zipSync } = await import('../../vendor/fflate.js');
  const entries = {};
  for (const f of files) {
    let name = f.name, i = 2;
    while (entries[name]) name = f.name.replace(/(\.[^.]+)?$/, `-${i++}$1`);
    entries[name] = [new Uint8Array(await f.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

// --- building documents ------------------------------------------------------

// Builds a PDF from a list of pages taken from loaded source documents.
// pages: [{ src: index into docs, index: page index, rotate: extra degrees }]
export async function assemble(docs, pages) {
  const { PDFDocument, degrees } = await pdfLib();
  const out = await PDFDocument.create();
  const copied = new Map();
  for (const [si, doc] of docs.entries()) {
    const want = [...new Set(pages.filter(p => p.src === si).map(p => p.index))];
    if (!want.length) continue;
    const got = await out.copyPages(doc, want);
    want.forEach((idx, k) => copied.set(si + ':' + idx, got[k]));
  }
  const used = new Set();
  for (const p of pages) {
    const key = p.src + ':' + p.index;
    let page = copied.get(key);
    // The same page twice (duplicate) needs its own copy.
    if (used.has(key)) [page] = await out.copyPages(docs[p.src], [p.index]);
    used.add(key);
    out.addPage(page);
    if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate + 360) % 360));
  }
  return out;
}

export async function mergeFiles(files) {
  const docs = [];
  for (const f of files) docs.push(await loadDoc(await bytesOf(f)));
  const pages = docs.flatMap((d, src) => d.getPageIndices().map(index => ({ src, index })));
  return assemble(docs, pages);
}

export async function rotateDoc(doc, deg, only) {
  const { degrees } = await pdfLib();
  doc.getPages().forEach((p, i) => {
    if (only && !only.includes(i)) return;
    p.setRotation(degrees((p.getRotation().angle + deg + 360) % 360));
  });
  return doc;
}

// The size a page shows at (rotation applied), from its crop box.
export function visualBox(page) {
  const b = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  return { ...b, rot: r, vw: r % 180 ? b.height : b.width, vh: r % 180 ? b.width : b.height };
}

// Maps a point measured on the page as it is shown (origin bottom-left) to the
// page's own coordinates, so text lands upright on rotated pages.
export function fromVisual(box, vx, vy) {
  const { x, y, width: W, height: H, rot } = box;
  if (rot === 90) return [x + W - vy, y + vx];
  if (rot === 180) return [x + W - vx, y + H - vy];
  if (rot === 270) return [x + vy, y + H - vx];
  return [x + vx, y + vy];
}

// Writes text at a visual spot. align 0 = left edge at vx, .5 = centred, 1 = right edge at vx.
function drawVisualText(lib, page, box, text, { vx, vy, size, font, color, opacity = 1, align = 0, angle = 0 }) {
  const w = font.widthOfTextAtSize(text, size);
  const a = angle * Math.PI / 180;
  // Shift along the text direction (in visual space) for alignment.
  const sx = vx - Math.cos(a) * w * align, sy = vy - Math.sin(a) * w * align;
  const [x, y] = fromVisual(box, sx, sy);
  page.drawText(text, { x, y, size, font, color, opacity, rotate: lib.degrees(box.rot + angle) });
}

// Characters Helvetica (WinAnsi) can write; the rest become "?".
export function safeText(font, text) {
  let out = '';
  for (const ch of String(text)) {
    try { font.encodeText(ch); out += ch; } catch { out += '?'; }
  }
  return out;
}

export const POSITIONS = [
  ['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'],
  ['top-center', 'Top centre'], ['top-right', 'Top right'], ['top-left', 'Top left'],
  ['outside', 'Bottom outside edge (books)'], ['center', 'Middle'], ['diagonal', 'Across the middle, diagonal'],
];
export const FORMATS = [['n', '1'], ['page-n', 'Page 1'], ['n-of-total', '1 / 12'], ['page-n-of-total', 'Page 1 of 12'], ['dash', '– 1 –']];

export function numberLabel(format, n, total) {
  return ({ n: `${n}`, 'page-n': `Page ${n}`, 'n-of-total': `${n} / ${total}`, 'page-n-of-total': `Page ${n} of ${total}`, dash: `– ${n} –` })[format] || `${n}`;
}

const hexRgb = (lib, hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0x333333;
  return lib.rgb((v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255);
};

// Adds page numbers or a text stamp to every page.
// opts: { mode: 'number'|'stamp', text, position, format, start, skipFirst, size, margin (mm), colour, opacity, bold }
export async function stampDoc(doc, opts = {}) {
  const lib = await pdfLib();
  const o = { mode: 'number', position: 'bottom-center', format: 'n', start: 1, skipFirst: false, size: 11, margin: 12, colour: '#333333', opacity: 1, ...opts };
  const font = await doc.embedFont(o.bold || o.mode === 'stamp' ? lib.StandardFonts.HelveticaBold : lib.StandardFonts.Helvetica);
  const color = hexRgb(lib, o.colour);
  const pages = doc.getPages();
  const counted = pages.length - (o.skipFirst ? 1 : 0);
  const total = counted + (+o.start || 1) - 1;
  pages.forEach((page, i) => {
    if (o.skipFirst && i === 0) return;
    const box = visualBox(page);
    const n = (+o.start || 1) + i - (o.skipFirst ? 1 : 0);
    const text = safeText(font, o.mode === 'stamp' ? (o.text || 'DRAFT') : numberLabel(o.format, n, total));
    let size = Math.max(4, +o.size || 11);
    const m = Math.max(0, +o.margin || 0) * MM;
    const { vw, vh } = box;
    let pos = o.position;
    if (pos === 'outside') pos = (n % 2) ? 'bottom-right' : 'bottom-left';
    if (pos === 'diagonal') {
      // Fit the text to about 80% of the page diagonal.
      const diag = Math.hypot(vw, vh), angle = Math.atan2(vh, vw) * 180 / Math.PI;
      const w1 = font.widthOfTextAtSize(text, 1);
      if (o.mode === 'stamp' && opts.size == null) size = Math.min(160, diag * .8 / w1);
      size = Math.min(size, diag * .9 / w1);
      const a = angle * Math.PI / 180, cap = font.heightAtSize(size, { descender: false });
      drawVisualText(lib, page, box, text, {
        vx: vw / 2 + Math.sin(a) * cap / 2, vy: vh / 2 - Math.cos(a) * cap / 2,
        size, font, color, opacity: o.opacity, align: .5, angle,
      });
      return;
    }
    const cap = font.heightAtSize(size, { descender: false });
    const [v, hz] = pos === 'center' ? ['middle', 'center'] : pos.split('-');
    const vy = v === 'top' ? vh - m - cap : v === 'middle' ? vh / 2 - cap / 2 : m;
    const vx = hz === 'left' ? m : hz === 'right' ? vw - m : vw / 2;
    const align = hz === 'left' ? 0 : hz === 'right' ? 1 : .5;
    drawVisualText(lib, page, box, text, { vx, vy, size, font, color, opacity: o.opacity, align });
  });
  return doc;
}

// --- images → PDF --------------------------------------------------------------

// EXIF orientation of a JPEG (1 = upright). PDF ignores EXIF, so turned photos are re-drawn.
export function jpegOrientation(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) {
      const t = i + 10, le = b[t] === 0x49;
      const r16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
      const r32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
      const ifd = t + r32(t + 4), n = r16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (r16(e) === 0x0112) return r16(e + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    i += 2 + len;
  }
  return 1;
}

// Gets an image into the document: JPEG and PNG go in as they are; everything
// else (WebP, GIF, HEIC on Safari, turned phone photos) is redrawn first.
async function embedImage(doc, file) {
  const bytes = await bytesOf(file);
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  try {
    if (isJpg && jpegOrientation(bytes) === 1) return await doc.embedJpg(bytes);
    if (isPng) return await doc.embedPng(bytes);
  } catch { /* fall through to redraw */ }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    throw new Error(`${file.name}: this browser cannot read that picture type`);
  }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  if (isJpg) return doc.embedJpg(await bytesOf(await canvasBlob(c, 'image/jpeg', .92)));
  return doc.embedPng(await bytesOf(await canvasBlob(c, 'image/png')));
}

// opts: { page: 'a4'|'letter'|'a3'|'a5'|'fit', margin: mm, orient: 'auto'|'portrait'|'landscape' }
export async function imagesToPdf(files, opts = {}, onProgress = () => {}) {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const m = Math.max(0, +(opts.margin ?? 10)) * MM;
  const kind = opts.page || 'a4', orient = opts.orient || 'auto';
  for (const [i, f] of files.entries()) {
    onProgress(i / files.length, f.name);
    const img = await embedImage(doc, f);
    let pw, ph;
    if (kind === 'fit') {
      // 96 pixels per inch, the screen convention, so a 1920 px photo is 20 inches wide.
      pw = img.width * .75 + 2 * m; ph = img.height * .75 + 2 * m;
    } else {
      [pw, ph] = SHEETS[kind] || SHEETS.a4;
      const land = orient === 'landscape' || (orient === 'auto' && img.width > img.height);
      if (land) [pw, ph] = [ph, pw];
    }
    const page = doc.addPage([pw, ph]);
    const aw = Math.max(1, pw - 2 * m), ah = Math.max(1, ph - 2 * m);
    const s = Math.min(aw / img.width, ah / img.height);
    const w = img.width * s, hh = img.height * s;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
  }
  doc.setProducer('The Toolbox');
  onProgress(1);
  return doc;
}

// PDF pages → PNG files at a chosen dpi.
export async function pdfToPngs(bytes, { dpi = 150, name = 'page', pages } = {}, onProgress = () => {}) {
  const view = await openView(bytes);
  const out = [];
  try {
    const list = pages || Array.from({ length: view.numPages }, (_, i) => i);
    const pad = String(view.numPages).length;
    for (const [k, i] of list.entries()) {
      onProgress(k / list.length, `Page ${i + 1}`);
      const c = await renderPage(await view.getPage(i + 1), { scale: dpi / 72 });
      const b = await canvasBlob(c, 'image/png');
      const f = new File([b], `${name}-${String(i + 1).padStart(pad, '0')}.png`, { type: 'image/png' });
      f.dpi = Math.round(c.usedScale * 72);
      out.push(f);
      c.width = c.height = 0;
    }
  } finally { view.destroy(); }
  onProgress(1);
  return out;
}

// --- making smaller --------------------------------------------------------------

// Lossless: re-save with object streams; also try rebuilding from the pages,
// which drops leftovers of earlier edits — but only when there are no
// bookmarks or form fields to lose. Returns the smallest result (maybe the original).
export async function compressLossless(bytes) {
  const lib = await pdfLib();
  const doc = await loadDoc(bytes);
  if (doc.isEncrypted) throw new Error('This PDF is password-protected or encrypted, so it cannot be re-saved here.');
  const tries = [{ how: 'kept as it was', bytes }];
  tries.push({ how: 're-saved with compressed object streams', bytes: await doc.save({ useObjectStreams: true, addDefaultPage: false }) });
  const cat = doc.catalog;
  const hasExtras = ['Outlines', 'AcroForm', 'Names', 'StructTreeRoot'].some(k => cat.get(lib.PDFName.of(k)));
  if (!hasExtras) {
    const fresh = await lib.PDFDocument.create();
    const pages = await fresh.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => fresh.addPage(p));
    for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator']) {
      const v = doc['get' + k]?.();
      if (v) fresh['set' + k](k === 'Keywords' ? [v] : v);
    }
    fresh.setProducer(doc.getProducer() || 'The Toolbox');
    tries.push({ how: 'rebuilt from its pages, dropping unused leftovers', bytes: await fresh.save({ useObjectStreams: true }) });
  }
  return tries.reduce((a, b) => (b.bytes.length < a.bytes.length ? b : a));
}

// Raster: every page becomes one JPEG picture. Text can no longer be selected or searched.
export async function compressRaster(bytes, { dpi = 150, quality = .75 } = {}, onProgress = () => {}) {
  const { PDFDocument } = await pdfLib();
  const view = await openView(bytes);
  const out = await PDFDocument.create();
  try {
    for (let i = 1; i <= view.numPages; i++) {
      onProgress((i - 1) / view.numPages, `Page ${i} of ${view.numPages}`);
      const page = await view.getPage(i);
      const vp1 = page.getViewport({ scale: 1, rotation: page.rotate });
      const c = await renderPage(page, { scale: dpi / 72 });
      const img = await out.embedJpg(await bytesOf(await canvasBlob(c, 'image/jpeg', quality)));
      const p = out.addPage([vp1.width, vp1.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      c.width = c.height = 0;
      page.cleanup();
    }
  } finally { view.destroy(); }
  out.setProducer('The Toolbox');
  onProgress(1);
  return out.save({ useObjectStreams: true });
}

// --- imposition -------------------------------------------------------------------

// Embeds every page of doc as a drawable piece, plus each page's shown size and rotation.
export async function embedAll(out, doc) {
  const res = [];
  for (const p of doc.getPages()) {
    const b = p.getCropBox();
    let emb = null;
    // A page with no content stream (a truly blank page) cannot be embedded; it stays blank.
    try { emb = await out.embedPage(p, { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }); } catch {}
    res.push(emb ? { emb, ...visualBox(p) } : null);
  }
  return res;
}

// Draws an embedded page centred and scaled to fit inside cell {x, y, w, h};
// turn = extra turn in degrees (180 for the upside-down zine row).
export function place(lib, sheet, piece, cell, turn = 0, pad = 0) {
  if (!piece) return;
  const r = (piece.rot + turn) % 360;
  const w0 = piece.emb.width, h0 = piece.emb.height;
  const vw = r % 180 ? h0 : w0, vh = r % 180 ? w0 : h0;
  const cw = Math.max(1, cell.w - 2 * pad), ch = Math.max(1, cell.h - 2 * pad);
  const s = Math.min(cw / vw, ch / vh);
  const bx = cell.x + (cell.w - vw * s) / 2, by = cell.y + (cell.h - vh * s) / 2;
  // A clockwise turn of r (how /Rotate works) is a pdf-lib rotation of -r about the drawing point.
  const at = { 0: [bx, by], 90: [bx, by + w0 * s], 180: [bx + w0 * s, by + h0 * s], 270: [bx + h0 * s, by] }[r];
  sheet.drawPage(piece.emb, { x: at[0], y: at[1], xScale: s, yScale: s, rotate: lib.degrees(-r) });
}

const sheetSize = (sheet, landscape, pieces, across = 1, down = 1) => {
  if (sheet === 'auto') {
    const ok = pieces.filter(Boolean);
    if (!ok.length) return [612 * across, 792 * down];
    const w = Math.max(...ok.map(p => p.vw)), h = Math.max(...ok.map(p => p.vh));
    return [w * across, h * down];
  }
  const [a, b] = SHEETS[sheet] || SHEETS.a4;
  return landscape ? [b, a] : [a, b];
};

// Saddle-stitch booklet: pages padded to a multiple of 4, two per side, in fold order.
// Print double-sided, flipping on the short edge, fold the stack, staple the spine.
export async function booklet(doc, { sheet = 'a4' } = {}) {
  const lib = await pdfLib();
  const out = await lib.PDFDocument.create();
  const pieces = await embedAll(out, doc);
  const n = Math.ceil(pieces.length / 4) * 4 || 4;
  const [W, H] = sheetSize(sheet, true, pieces, 2, 1);
  const order = [];
  for (let i = 0; i < n / 4; i++) {
    order.push([n - 1 - 2 * i, 2 * i], [2 * i + 1, n - 2 - 2 * i]);
  }
  for (const [l, r] of order) {
    const s = out.addPage([W, H]);
    place(lib, s, pieces[l], { x: 0, y: 0, w: W / 2, h: H });
    place(lib, s, pieces[r], { x: W / 2, y: 0, w: W / 2, h: H });
  }
  return { doc: out, sheets: n / 4, blanks: n - pieces.length, order };
}

// N-up: 2 or 4 (or 8/9) pages on each sheet, left to right, top to bottom.
export async function nUp(doc, { per = 2, sheet = 'a4', gap = 0 } = {}) {
  const lib = await pdfLib();
  const out = await lib.PDFDocument.create();
  const pieces = await embedAll(out, doc);
  const grid = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 16: [4, 4] }[per] || [2, 1];
  const first = pieces.find(Boolean);
  const portrait = !first || first.vh >= first.vw;
  // Choose the sheet orientation that gives each page the most room.
  let [cols, rows] = grid;
  const land = sheet === 'auto' ? true : null;
  let W, H;
  if (land === null) {
    const [a, b] = SHEETS[sheet] || SHEETS.a4;
    const score = (w, h, c, r) => { const pw = first?.vw || 1, ph = first?.vh || 1; return Math.min(w / c / pw, h / r / ph); };
    const opts = [[b, a, cols, rows], [a, b, cols, rows], [b, a, rows, cols], [a, b, rows, cols]];
    [W, H, cols, rows] = opts.reduce((x, y) => (score(...y) > score(...x) ? y : x));
  } else {
    if (!portrait && cols > rows) [cols, rows] = [rows, cols];
    [W, H] = sheetSize('auto', true, pieces, cols, rows);
  }
  const g = gap * MM;
  for (let i = 0; i < pieces.length; i += per) {
    const s = out.addPage([W, H]);
    for (let k = 0; k < per && i + k < pieces.length; k++) {
      const c = k % cols, r = Math.floor(k / cols);
      const cw = W / cols, ch = H / rows;
      place(lib, s, pieces[i + k], { x: c * cw, y: H - (r + 1) * ch, w: cw, h: ch }, 0, g / 2);
    }
  }
  return { doc: out, sheets: out.getPageCount(), cols, rows };
}

// Eight-page mini-zine on one side of one sheet: fold, cut the middle slit, fold into a book.
// Layout (top row upside down):  5 4 3 2  /  6 7 8 1
export const ZINE_LAYOUT = { top: [4, 3, 2, 1], bottom: [5, 6, 7, 0] };
export async function zine(doc, { sheet = 'a4', guides = true } = {}) {
  const lib = await pdfLib();
  const out = await lib.PDFDocument.create();
  const pieces = await embedAll(out, doc);
  const [W, H] = sheetSize(sheet, true, pieces, 4, 2);
  const font = await out.embedFont(lib.StandardFonts.Helvetica);
  const cw = W / 4, ch = H / 2, pad = 4 * MM;
  for (let start = 0; start < Math.max(1, pieces.length); start += 8) {
    const s = out.addPage([W, H]);
    ZINE_LAYOUT.top.forEach((p, c) => place(lib, s, pieces[start + p], { x: c * cw, y: ch, w: cw, h: ch }, 180, pad));
    ZINE_LAYOUT.bottom.forEach((p, c) => place(lib, s, pieces[start + p], { x: c * cw, y: 0, w: cw, h: ch }, 0, pad));
    if (guides) {
      const grey = lib.rgb(.6, .6, .6), red = lib.rgb(.85, .1, .1);
      for (let c = 1; c < 4; c++) s.drawLine({ start: { x: c * cw, y: 0 }, end: { x: c * cw, y: H }, thickness: .4, color: grey, dashArray: [2, 3] });
      s.drawLine({ start: { x: 0, y: ch }, end: { x: cw, y: ch }, thickness: .4, color: grey, dashArray: [2, 3] });
      s.drawLine({ start: { x: 3 * cw, y: ch }, end: { x: W, y: ch }, thickness: .4, color: grey, dashArray: [2, 3] });
      s.drawLine({ start: { x: cw, y: ch }, end: { x: 3 * cw, y: ch }, thickness: 1, color: red, dashArray: [6, 3] });
      s.drawText('cut', { x: W / 2 - 6, y: ch + 3, size: 7, font, color: red });
    }
  }
  return { doc: out, sheets: out.getPageCount() };
}

// Accordion (concertina) fold: pages side by side on a strip, fold lines between them.
// sides = 2 puts the second half on a back sheet, also left to right.
export async function accordion(doc, { panels = 0, sheet = 'auto', guides = true, sides = 1 } = {}) {
  const lib = await pdfLib();
  const out = await lib.PDFDocument.create();
  const pieces = await embedAll(out, doc);
  const k = panels || Math.max(1, Math.ceil(pieces.length / sides));
  const [W, H] = sheetSize(sheet, true, pieces, k, 1);
  const cw = W / k, grey = lib.rgb(.6, .6, .6);
  for (let start = 0; start < pieces.length; start += k) {
    const s = out.addPage([W, H]);
    for (let c = 0; c < k; c++) place(lib, s, pieces[start + c], { x: c * cw, y: 0, w: cw, h: H });
    if (guides) for (let c = 1; c < k; c++) s.drawLine({ start: { x: c * cw, y: 0 }, end: { x: c * cw, y: H }, thickness: .4, color: grey, dashArray: [2, 3] });
  }
  return { doc: out, sheets: out.getPageCount(), panels: k };
}

// Crop: rect in page coordinates [x1, y1, x2, y2]. Sets every page box so all apps agree.
export function cropPage(page, [x1, y1, x2, y2]) {
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), hh = Math.abs(y2 - y1);
  if (w < 1 || hh < 1) return;
  page.setMediaBox(x, y, w, hh);
  page.setCropBox(x, y, w, hh);
  page.setTrimBox(x, y, w, hh);
  page.setBleedBox(x, y, w, hh);
  page.setArtBox(x, y, w, hh);
}
