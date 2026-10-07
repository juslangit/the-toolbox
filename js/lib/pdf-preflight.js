// Print-readiness check for a PDF: sizes, fonts, image resolution, colour, version, security.
// pdf-lib reads the file's structure; pdf.js works out where images are placed on the page.
import { pdfLib, pdfjs, openView, MM } from './pdf-core.js';

const KNOWN = [['A4', 595.28, 841.89], ['A3', 841.89, 1190.55], ['A5', 419.53, 595.28], ['A6', 297.64, 419.53],
  ['US Letter', 612, 792], ['US Legal', 612, 1008], ['Tabloid', 792, 1224], ['B5', 498.9, 708.66], ['DL envelope', 311.81, 623.62],
  ['Business card (85 × 55)', 155.91, 240.94]];
export function sizeName(w, h) {
  const [a, b] = w < h ? [w, h] : [h, w];
  const k = KNOWN.find(([, x, y]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3);
  return k ? `${k[0]}${w > h + 1 ? ' landscape' : ''}` : 'custom size';
}
const mm = pt => Math.round(pt / MM * 10) / 10;
const inch = pt => Math.round(pt / 72 * 100) / 100;
export const sizeText = (w, h) => `${mm(w)} × ${mm(h)} mm · ${inch(w)} × ${inch(h)} in`;

function mul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

// Where each picture lands on a page, and so its effective pixels per inch.
async function imagePlacements(view, pageNo, OPS) {
  const page = await view.getPage(pageNo);
  const ops = await page.getOperatorList();
  const found = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a?.[0]) ctm = mul(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const w = fn === OPS.paintImageXObject ? a[1] : a[0]?.width, hh = fn === OPS.paintImageXObject ? a[2] : a[0]?.height;
      const pw = Math.hypot(ctm[0], ctm[1]), ph = Math.hypot(ctm[2], ctm[3]);
      if (!w || !hh || pw < .5 || ph < .5) continue;
      found.push({ page: pageNo, px: [w, hh], placed: [pw, ph], ppi: Math.round(Math.min(w / (pw / 72), hh / (ph / 72))) });
    }
  }
  page.cleanup();
  return found;
}

export async function preflight(bytes, onProgress = () => {}) {
  const lib = await pdfLib();
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, decodePDFRawStream } = lib;
  const N = s => PDFName.of(s);
  const r = { checks: [], fonts: new Map(), colour: new Set(), images: [], pages: [], meta: {} };
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 1024));
  r.version = head.match(/%PDF-(\d\.\d)/)?.[1] || '?';

  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const L = v => (v instanceof PDFRef ? ctx.lookup(v) : v);
  const catVer = L(doc.catalog.get(N('Version')));
  if (catVer) r.version = String(catVer).replace('/', '');
  r.encrypted = !!doc.isEncrypted;
  if (r.encrypted) {
    const enc = L(ctx.trailerInfo.Encrypt);
    const P = enc instanceof PDFDict ? L(enc.get(N('P')))?.asNumber?.() : null;
    r.printAllowed = P == null ? null : !!(P & 4);
  }
  const safe = f => { try { return f() || ''; } catch { return ''; } };
  r.meta = {
    Title: safe(() => doc.getTitle()), Author: safe(() => doc.getAuthor()), Subject: safe(() => doc.getSubject()),
    Creator: safe(() => doc.getCreator()), Producer: safe(() => doc.getProducer()),
    Created: safe(() => doc.getCreationDate()?.toISOString().slice(0, 10)), Modified: safe(() => doc.getModificationDate()?.toISOString().slice(0, 10)),
  };

  const csName = cs => {
    cs = L(cs);
    if (cs instanceof PDFName) return { DeviceRGB: 'RGB', DeviceCMYK: 'CMYK', DeviceGray: 'Greyscale', Pattern: 'Pattern' }[cs.decodeText()] || cs.decodeText();
    if (cs instanceof PDFArray) {
      const kind = L(cs.get(0))?.decodeText?.();
      if (kind === 'ICCBased') { const n = L(cs.get(1))?.dict?.get(N('N')); const k = L(n)?.asNumber?.(); return { 1: 'Greyscale (ICC profile)', 3: 'RGB (ICC profile)', 4: 'CMYK (ICC profile)' }[k] || 'ICC profile'; }
      if (kind === 'Indexed') return `Indexed (${csName(cs.get(1))})`;
      if (kind === 'Separation') return `Spot colour “${L(cs.get(1))?.decodeText?.() || '?'}”`;
      if (kind === 'DeviceN') return 'DeviceN (several inks)';
      return kind || 'unknown';
    }
    return null;
  };
  const seen = new Set();
  const walk = (res, pageNo) => {
    res = L(res);
    if (!(res instanceof PDFDict) || seen.has(res)) return;
    seen.add(res);
    const fonts = L(res.get(N('Font')));
    if (fonts instanceof PDFDict) for (const [, ref] of fonts.entries()) {
      const f = L(ref);
      if (!(f instanceof PDFDict)) continue;
      const sub = L(f.get(N('Subtype')))?.decodeText?.() || '?';
      let name = L(f.get(N('BaseFont')))?.decodeText?.() || (sub === 'Type3' ? 'Type 3 font' : 'unnamed font');
      let desc = L(f.get(N('FontDescriptor')));
      if (sub === 'Type0') {
        const d = L(L(f.get(N('DescendantFonts')))?.get?.(0));
        desc = L(d?.get?.(N('FontDescriptor')));
      }
      const embedded = sub === 'Type3' || !!(desc instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some(k => desc.get(N(k))));
      const subset = /^[A-Z]{6}\+/.test(name);
      name = name.replace(/^[A-Z]{6}\+/, '');
      const key = name + '|' + embedded;
      const prev = r.fonts.get(key);
      if (prev) prev.pages.add(pageNo);
      else r.fonts.set(key, { name, type: { Type1: 'Type 1', TrueType: 'TrueType', Type0: 'Composite (CID)', Type3: 'Type 3', MMType1: 'Multiple master' }[sub] || sub, embedded, subset, pages: new Set([pageNo]) });
    }
    const css = L(res.get(N('ColorSpace')));
    if (css instanceof PDFDict) for (const [, v] of css.entries()) { const n = csName(v); if (n) r.colour.add(n); }
    const xo = L(res.get(N('XObject')));
    if (xo instanceof PDFDict) for (const [, ref] of xo.entries()) {
      const x = L(ref);
      if (!(x instanceof PDFStream)) continue;
      const st = L(x.dict.get(N('Subtype')))?.decodeText?.();
      if (st === 'Image') {
        if (L(x.dict.get(N('ImageMask')))?.asBoolean?.()) continue;
        const n = csName(x.dict.get(N('ColorSpace')));
        const filt = L(x.dict.get(N('Filter')));
        const fname = (filt instanceof PDFArray ? L(filt.get(filt.size() - 1)) : filt)?.decodeText?.();
        if (n) r.colour.add(n);
        else if (fname === 'JPXDecode') r.colour.add('JPEG 2000 (colour inside the image)');
      } else if (st === 'Form') walk(x.dict.get(N('Resources')), pageNo);
    }
  };
  const inherited = (node, key) => {
    for (let n = node, i = 0; n && i < 50; n = L(n.get(N('Parent'))), i++) { const v = n.get(N(key)); if (v) return v; }
    return null;
  };
  const opsSeen = new Set();
  const pages = doc.getPages();
  for (const [i, p] of pages.entries()) {
    const c = p.getCropBox(), rot = ((p.getRotation().angle % 360) + 360) % 360;
    const w = rot % 180 ? c.height : c.width, hh = rot % 180 ? c.width : c.height;
    const trim = p.node.get(N('TrimBox')) && p.getTrimBox(), bleed = p.node.get(N('BleedBox')) && p.getBleedBox();
    r.pages.push({ w, h: hh, rot, trim, bleed });
    walk(inherited(p.node, 'Resources'), i + 1);
    // Colours used straight in the drawing commands (not via a named colour space).
    try {
      let contents = L(p.node.get(N('Contents')));
      const parts = contents instanceof PDFArray ? contents.asArray().map(L) : [contents];
      for (const s of parts) {
        if (!(s instanceof PDFRawStream) || opsSeen.size === 3) continue;
        const text = new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
        if (/(?:^|\s)(?:-?[\d.]+\s+){4}[kK](?=\s)/.test(text)) opsSeen.add('CMYK');
        if (/(?:^|\s)(?:-?[\d.]+\s+){3}(?:rg|RG)(?=\s)/.test(text)) opsSeen.add('RGB');
        if (/(?:^|\s)-?[\d.]+\s+[gG](?=\s)/.test(text)) opsSeen.add('Greyscale');
      }
    } catch { /* encrypted or unusual stream: skip */ }
    onProgress(.5 * (i + 1) / pages.length);
  }
  for (const s of opsSeen) r.colour.add(s);

  // Image resolution needs pdf.js to follow the drawing commands.
  try {
    const { OPS } = await pdfjs();
    const view = await openView(bytes);
    try {
      const limit = Math.min(view.numPages, 200);
      for (let n = 1; n <= limit; n++) {
        r.images.push(...await imagePlacements(view, n, OPS));
        onProgress(.5 + .5 * n / limit);
      }
      r.imagesChecked = limit;
    } finally { view.destroy(); }
  } catch (e) {
    r.imageError = e?.name === 'PasswordException' ? 'It needs a password to open, so pictures could not be checked.' : 'Pictures could not be checked in this file.';
  }
  onProgress(1);

  // --- plain verdicts ---
  const add = (level, text) => r.checks.push({ level, text });
  const sizes = new Map();
  for (const p of r.pages) {
    const k = `${Math.round(p.w)}x${Math.round(p.h)}`;
    if (!sizes.has(k)) sizes.set(k, { w: p.w, h: p.h, count: 0, name: sizeName(p.w, p.h) });
    sizes.get(k).count++;
  }
  r.sizes = [...sizes.values()];
  if (r.sizes.length === 1) add('good', `Every page is the same size: ${r.sizes[0].name}, ${sizeText(r.sizes[0].w, r.sizes[0].h)}.`);
  else add('warn', `Pages come in ${r.sizes.length} different sizes. A printer will scale or crop the odd ones out.`);
  const fonts = [...r.fonts.values()];
  const loose = fonts.filter(f => !f.embedded);
  if (!fonts.length) add('good', 'No fonts — the pages are pictures or shapes only (text cannot be selected).');
  else if (!loose.length) add('good', `All ${fonts.length} font${fonts.length > 1 ? 's are' : ' is'} embedded, so the text prints as designed.`);
  else add('bad', `${loose.length} font${loose.length > 1 ? 's are' : ' is'} not embedded (${loose.map(f => f.name).join(', ')}). The printer will substitute ${loose.length > 1 ? 'them' : 'it'} — re-export with fonts embedded.`);
  if (r.imageError) add('warn', r.imageError);
  else if (!r.images.length) add('good', 'No pictures to check.');
  else {
    const low = r.images.filter(i => i.ppi < 150), mid = r.images.filter(i => i.ppi >= 150 && i.ppi < 300);
    const min = Math.min(...r.images.map(i => i.ppi));
    if (low.length) add('bad', `${low.length} picture${low.length > 1 ? 's are' : ' is'} below 150 ppi at printed size (lowest ${min} ppi) — ${low.length > 1 ? 'they' : 'it'} will look soft or blocky.`);
    if (mid.length) add('warn', `${mid.length} picture${mid.length > 1 ? 's are' : ' is'} between 150 and 300 ppi — fine for office printing, a little soft for professional print.`);
    if (!low.length && !mid.length) add('good', `All ${r.images.length} picture${r.images.length > 1 ? 's are' : ' is'} 300 ppi or more at printed size.`);
  }
  const col = [...r.colour];
  const rgb = col.some(c => c.startsWith('RGB')), cmyk = col.some(c => c.startsWith('CMYK')), spot = col.filter(c => c.startsWith('Spot'));
  if (rgb && !cmyk) add('warn', 'Colours are RGB. Fine for home and office printers; a print shop will convert to CMYK, and bright colours may dull.');
  else if (rgb && cmyk) add('warn', 'RGB and CMYK are mixed. Ask the print shop whether they want everything in CMYK.');
  else if (cmyk) add('good', 'Colours are CMYK, which print shops expect.');
  else add('good', `Colour: ${col.join(', ') || 'black only'}.`);
  if (spot.length) add('warn', `Spot colours: ${spot.map(s => s.replace('Spot colour ', '')).join(', ')} — only matters if you are paying for those inks.`);
  const bleedPages = r.pages.filter(p => p.trim && p.bleed && p.bleed.width - p.trim.width > 1);
  if (bleedPages.length) {
    const p = bleedPages[0];
    add('good', `Bleed is set: about ${mm((p.bleed.width - p.trim.width) / 2)} mm each side.`);
  } else add('warn', 'No bleed is set. Fine unless colour or pictures run to the edge of the paper — then add 3 mm bleed.');
  if (r.encrypted) add(r.printAllowed === false ? 'bad' : 'warn', r.printAllowed === false ? 'It is locked against printing.' : 'It is encrypted (password or permissions). Some print shops cannot open these.');
  else add('good', 'Not encrypted.');
  if (+r.version >= 2) add('warn', `PDF version ${r.version} — older RIPs may not read it; PDF 1.4–1.7 is the safe choice.`);
  else add('good', `PDF version ${r.version}.`);
  r.verdict = r.checks.some(c => c.level === 'bad') ? 'bad' : r.checks.some(c => c.level === 'warn') ? 'warn' : 'good';
  return r;
}
