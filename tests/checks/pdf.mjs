// Checks for the PDF & print drawer. Test PDFs are made in the page with pdf-lib;
// results are read back with pdf-lib (counts, sizes, rotation) and pdf.js (text).
import { set, wait, giveFile, pngFile, until } from '../helpers.mjs';

const LIB = `await import(new URL('vendor/pdf-lib.js', location.href).href)`;
const CORE = `await import(new URL('js/lib/pdf-core.js', location.href).href)`;

// A PDF with n A4 pages, each saying "<prefix> 1", "<prefix> 2", …
const fixture = (n = 3, name = 'test.pdf', prefix = 'Page') => `(async () => { const L = ${LIB}; const d = await L.PDFDocument.create(); const f = await d.embedFont(L.StandardFonts.Helvetica);
  for (let i = 1; i <= ${n}; i++) { const p = d.addPage([595.28, 841.89]); p.drawText('${prefix} ' + i, { x: 60, y: 700, size: 30, font: f }); }
  return new File([await d.save()], '${name}', { type: 'application/pdf' }); })()`;

const click = (text, i = 0) => `(() => { const b = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${JSON.stringify(text)})[${i}]; if (!b) throw new Error('no button ' + ${JSON.stringify(text)}); b.click(); })()`;
const visibleResult = `[...document.querySelectorAll('.pdf-result')].find(e => !e.hidden && e.offsetParent)`;
const hasResult = `(${visibleResult} && ${visibleResult}.files.length)`;

// Runs body with L (pdf-lib), C (pdf-core), files (result files), doc (first result loaded),
// text(n) (text on page n of the first result). body returns '' or a problem.
const inspect = body => `(async () => { const L = ${LIB}; const C = ${CORE};
  const res = ${visibleResult}; if (!res || !res.files.length) return 'no result shown';
  const files = res.files; const bytes = new Uint8Array(await files[0].arrayBuffer());
  const doc = files[0].type === 'application/pdf' ? await L.PDFDocument.load(bytes) : null;
  const view = doc ? await C.openView(bytes) : null;
  const text = n => C.pageText(view, n);
  try { ${body} } finally { view && view.destroy(); } })()`;

const step = id => `(await import(new URL('js/hub.js', location.href).href)).hub.tools.flatMap(t => t.steps || []).find(s => s.id === '${id}')`;
const near = (a, b, tol = 1) => `Math.abs((${a}) - (${b})) < ${tol}`;

export default {
  'pdf-organise': [
    giveFile('input[type=file]', fixture(3, 'a.pdf', 'Page')), until(`document.querySelectorAll('.pdf-page').length === 3`),
    giveFile('input[type=file]', fixture(2, 'b.pdf', 'Other')), until(`document.querySelectorAll('.pdf-page').length === 5`),
    // delete page 2, move page 1 later, turn the new first page
    `document.querySelectorAll('.pdf-page')[1].querySelectorAll('.pdf-page-btns button')[4].click()`,
    `document.querySelectorAll('.pdf-page')[0].querySelectorAll('.pdf-page-btns button')[1].click()`,
    `document.querySelectorAll('.pdf-page')[0].querySelectorAll('.pdf-page-btns button')[2].click()`,
    // duplicate the last page
    `document.querySelectorAll('.pdf-page')[3].querySelectorAll('.pdf-page-btns button')[3].click()`,
    click('Save as one PDF'), until(hasResult),
    inspect(`const n = doc.getPageCount(); if (n !== 5) return 'merged pages ' + n;
      const t = []; for (let i = 1; i <= 5; i++) t.push((await text(i)).trim());
      if (t.join('|') !== 'Page 3|Page 1|Other 1|Other 2|Other 2') return 'order: ' + t.join('|');
      if (doc.getPage(0).getRotation().angle !== 90 || doc.getPage(1).getRotation().angle !== 0) return 'rotation ' + doc.getPage(0).getRotation().angle;
      return '';`),
    click('By page ranges'), set('input[placeholder="1-3, 4-6, 7-"]', '1-2, 3-5'), click('Split'), until(`${hasResult} === 2`),
    inspect(`const counts = []; for (const f of files) counts.push((await L.PDFDocument.load(await f.arrayBuffer())).getPageCount());
      return counts.join(',') === '2,3' && files[1].name.endsWith('-p3-5.pdf') ? '' : 'split ' + counts.join(',') + ' ' + files.map(f => f.name);`),
    // the workflow step
    `(async () => { const s = ${step('pdf-merge')}; const out = await s.run([await ${fixture(2)}, await ${fixture(3)}], {}, {});
      const d = await (${LIB}).PDFDocument.load(await out[0].arrayBuffer()); return out.length === 1 && d.getPageCount() === 5 ? '' : 'pdf-merge step'; })()`,
  ],
  'pdf-images': [
    giveFile('input[accept="image/*"]', `Promise.all([${pngFile(64, 48, '#e8a33d', 'wide.png')}, ${pngFile(30, 60, '#5fb8b0', 'tall.png')}])`),
    until(`document.querySelectorAll('.pdf-page').length === 2`),
    click('Make PDF'), until(hasResult),
    inspect(`const s = doc.getPages().map(p => p.getSize()); if (s.length !== 2) return 'pages ' + s.length;
      return ${near('s[0].width', 841.89)} && ${near('s[0].height', 595.28)} && ${near('s[1].width', 595.28)} ? '' : 'sizes ' + JSON.stringify(s);`),
    click('PDF → pictures'), giveFile('input[accept="application/pdf,.pdf"]', fixture(3)),
    set('select', '72', 2), click('Make pictures'), until(`${hasResult} === 3`, 15000),
    inspect(`const b = await createImageBitmap(files[0]); return files.length === 3 && b.width === 595 && b.height === 842 && files[2].name === 'test-3.png' ? '' : 'png ' + files.length + ' ' + b.width + 'x' + b.height + ' ' + files[2].name;`),
    `(async () => { const s = ${step('images-to-pdf')}; const out = await s.run([await ${pngFile(80, 40)}], { page: 'fit', margin: 0 }, {});
      const d = await (${LIB}).PDFDocument.load(await out[0].arrayBuffer()); const z = d.getPage(0).getSize();
      return ${near('z.width', 60)} && ${near('z.height', 30)} ? '' : 'images-to-pdf fit ' + JSON.stringify(z); })()`,
    `(async () => { const s = ${step('pdf-to-png')}; const out = await s.run([await ${fixture(2)}], { dpi: 36 }, {});
      const b = await createImageBitmap(out[1]); return out.length === 2 && b.width === 298 ? '' : 'pdf-to-png ' + out.length + ' ' + b.width; })()`,
  ],
  'pdf-rotate-crop': [
    giveFile('input[type=file]', fixture(3)), until(`document.querySelector('.pdf-stage canvas')`),
    click('Turn all ↻'), wait(300), click('Next ›'), wait(300), click('Turn this page ↻'), wait(400),
    set('.pdf-margins input', '10', 0), set('.pdf-margins input', '10', 1), set('.pdf-margins input', '10', 2), set('.pdf-margins input', '20', 3),
    click('Crop every page'), wait(500), click('Save PDF'), until(hasResult),
    inspect(`const r = doc.getPages().map(p => p.getRotation().angle).join(','); if (r !== '90,180,90') return 'rotations ' + r;
      // Page 1 is shown turned 90°: its left margin (20 mm) is the bottom of the page itself.
      const m = doc.getPage(0).getMediaBox(), c = doc.getPage(0).getCropBox();
      return ${near('m.width', '595.28 - 2 * 28.346', 1)} && ${near('m.height', '841.89 - 3 * 28.346', 1)} && ${near('m.y', 56.69, 1)} && ${near('c.x', 28.35, 1)} ? '' : 'crop ' + JSON.stringify(m);`),
    `(async () => { const s = ${step('pdf-rotate')}; const out = await s.run([await ${fixture(2)}], { degrees: 270 }, {});
      const d = await (${LIB}).PDFDocument.load(await out[0].arrayBuffer()); return d.getPage(1).getRotation().angle === 270 ? '' : 'pdf-rotate step'; })()`,
  ],
  'pdf-numbers': [
    giveFile('input[type=file]', fixture(3)), until(hasResult), set('select', 'page-n-of-total', 1), wait(1200),
    inspect(`const t = await text(2); return t.includes('Page 2 of 3') ? '' : 'page 2 text: ' + t;`),
    `document.querySelector('.check input').click()`, wait(1200),
    inspect(`const a = await text(1), b = await text(2); return !a.includes(' of ') && b.includes('Page 1 of 2') ? '' : 'skip first: ' + a + ' / ' + b;`),
    `document.querySelector('.check input').click()`, click('Text stamp'), wait(1200),
    inspect(`const t = await text(3); return t.includes('CONFIDENTIAL') ? '' : 'stamp: ' + t;`),
    // numbers on a page turned sideways land upright at the bottom of the shown page
    `(async () => { const L = ${LIB}; const C = ${CORE}; const d = await L.PDFDocument.load(await (await ${fixture(1)}).arrayBuffer());
      d.getPage(0).setRotation(L.degrees(90)); await C.stampDoc(d, { position: 'bottom-right', format: 'n', start: 7 });
      const v = await C.openView(await d.save()); const p = await v.getPage(1); const vp = p.getViewport({ scale: 1 });
      const it = (await p.getTextContent()).items.find(i => i.str === '7'); const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const up = Math.abs(it.transform[0]) < 0.01 && it.transform[1] > 0; v.destroy();
      return up && x > vp.width * 0.9 && y > vp.height * 0.9 ? '' : 'rotated numbering at ' + Math.round(x) + ',' + Math.round(y) + ' of ' + vp.width + 'x' + vp.height; })()`,
    `(async () => { const s = ${step('pdf-number')}; const out = await s.run([await ${fixture(2)}], { position: 'top-right', start: 5, format: 'page-n-of-total' }, {});
      const C = ${CORE}; const v = await C.openView(new Uint8Array(await out[0].arrayBuffer())); const t = await C.pageText(v, 2); v.destroy();
      return t.includes('Page 6 of 6') ? '' : 'pdf-number step: ' + t; })()`,
  ],
  'pdf-compress': [
    giveFile('input[type=file]', fixture(3)), click('Make it smaller'), until(hasResult),
    inspect(`const t = await text(1); const st = document.querySelector('.stat-grid').textContent;
      return doc.getPageCount() === 3 && t.includes('Page 1') && /Before/.test(st) && /After/.test(st) ? '' : 'lossless ' + t + ' ' + st;`),
    `(async () => { const C = ${CORE}; const src = new Uint8Array(await (await ${fixture(3)}).arrayBuffer());
      const r = await C.compressLossless(src); if (r.bytes.length > src.length) return 'lossless grew';
      const ras = await C.compressRaster(src, { dpi: 50, quality: .5 }); const v = await C.openView(ras); const t = (await C.pageText(v, 1)).trim(); const n = v.numPages; v.destroy();
      return n === 3 && t === '' ? '' : 'raster kept text: ' + t; })()`,
    `(async () => { const s = ${step('pdf-compress')}; const f = await ${fixture(2)}; const out = await s.run([f], { mode: 'lossless' }, {});
      return out[0].size <= f.size && out[0].name === 'test.pdf' ? '' : 'pdf-compress step'; })()`,
  ],
  'pdf-preflight': [
    giveFile('input[type=file]', `(async () => { const L = ${LIB}; const d = await L.PDFDocument.create(); const f = await d.embedFont(L.StandardFonts.Helvetica);
      const png = async (w) => { const c = document.createElement('canvas'); c.width = c.height = w; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, w, w); return new Uint8Array(await (await new Promise(r => c.toBlob(r))).arrayBuffer()); };
      const p = d.addPage([595.28, 841.89]); p.drawText('Hello', { x: 50, y: 780, size: 20, font: f });
      p.drawImage(await d.embedPng(await png(300)), { x: 50, y: 500, width: 72, height: 72 });
      p.drawImage(await d.embedPng(await png(100)), { x: 200, y: 400, width: 144, height: 144 });
      d.addPage([612, 792]);
      return new File([await d.save()], 'print.pdf', { type: 'application/pdf' }); })()`),
    until(`document.querySelector('.pdf-checks')`, 15000),
    `(() => { const t = document.querySelector('.tool-body').textContent; const v = document.querySelector('.verdict').textContent;
      const ppi = [...document.querySelectorAll('.table td.pdf-ok, .table td.pdf-bad')].map(td => td.textContent);
      const probs = [];
      if (!v.includes('Fix')) probs.push('verdict ' + v);
      if (!t.includes('2 different sizes')) probs.push('mixed sizes');
      if (!t.includes('210 × 297 mm') || !t.includes('215.9 × 279.4 mm · 8.5 × 11 in')) probs.push('size text');
      if (!/Helvetica.*No/.test(t) || !t.includes('not embedded')) probs.push('font not flagged');
      if (!ppi.includes('300') || !ppi.includes('50')) probs.push('ppi ' + ppi.join(','));
      if (!t.includes('RGB')) probs.push('colour');
      return probs.join('; '); })()`,
  ],
  'pdf-impose': [
    giveFile('input[type=file]', fixture(6)), until(hasResult), wait(400),
    inspect(`const n = doc.getPageCount(); const s = doc.getPage(0).getSize(); if (n !== 4) return 'booklet sides ' + n;
      if (!(${near('s.width', 841.89)})) return 'sheet width ' + s.width;
      const t = [1, 2, 3, 4].map(() => ''); for (let i = 1; i <= 4; i++) t[i - 1] = (await text(i)).replace(/\\s+/g, ' ').trim();
      return t.join('|') === 'Page 1|Page 2|Page 6 Page 3|Page 4 Page 5' ? '' : 'booklet order ' + t.join('|');`),
    click('4 per sheet'), wait(1200),
    inspect(`return doc.getPageCount() === 2 && (await text(1)).replace(/\\s+/g, ' ').trim() === 'Page 1 Page 2 Page 3 Page 4' ? '' : '4-up ' + doc.getPageCount();`),
  ],
  'pdf-zine': [
    giveFile('input[type=file]', fixture(8)), until(hasResult), wait(400),
    inspect(`if (doc.getPageCount() !== 1) return 'zine sheets ' + doc.getPageCount();
      const v = (await view.getPage(1)); const items = (await v.getTextContent()).items; const W = 841.89, H = 595.28;
      const at = s => items.find(i => i.str === s)?.transform;
      const p1 = at('Page 1'), p5 = at('Page 5'), p6 = at('Page 6');
      if (!p1 || !p5 || !p6) return 'zine text missing';
      if (!(p1[4] > W * 0.75 && p1[5] < H / 2 && p1[0] > 0)) return 'page 1 not bottom right ' + p1;
      if (!(p5[0] < 0 && p5[5] > H / 2 && p5[4] < W / 4)) return 'page 5 not top left upside down ' + p5;
      if (!(p6[4] < W / 4 && p6[5] < H / 2)) return 'page 6 not bottom left';
      return '';`),
    click('Accordion fold'), wait(1200),
    inspect(`const s = doc.getPage(0).getSize(); return ${near('s.width', '8 * 595.28', 2)} && doc.getPageCount() === 1 ? '' : 'accordion ' + JSON.stringify(s);`),
  ],
};
