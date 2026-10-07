// PDF & print drawer: organise, convert, rotate/crop, number, compress, preflight and impose PDFs.
// Everything happens on the device with pdf-lib (writing) and pdf.js (drawing pages).
import { h, field, input, select, checkbox, note, row, card, grid, tabs, fmtBytes, progress, toast } from '../ui.js';
import { icon } from '../icons.js';
import {
  pdfLib, loadDoc, openView, renderPage, bytesOf, pdfFile, baseName, isPdf, parseRanges, assemble, mergeFiles,
  rotateDoc, stampDoc, imagesToPdf, pdfToPngs, compressLossless, compressRaster, booklet, nUp, zine, accordion,
  cropPage, MM, SHEET_CHOICES, POSITIONS, FORMATS,
} from '../lib/pdf-core.js';
import { pdfDrop, resultBox, previewPages, busy, readPdf } from '../lib/pdf-ui.js';

const PDF = ['application/pdf', '.pdf'];
const fileBtn = (label, cls = 'btn') => h('button', { class: cls, type: 'button' }, label);
const encryptedNote = 'This PDF is encrypted. pdf-lib cannot unlock it, so the result may come out blank or broken — remove the password first.';

// ---------------------------------------------------------------------------
// 1. Organiser: merge, reorder, rotate, duplicate, delete, split.
const organiser = {
  id: 'pdf-organise', name: 'PDF organiser', group: 'pdf', icon: 'files',
  desc: 'Merge PDFs, then reorder, rotate, copy or delete pages — or split into pieces.',
  keywords: 'pdf merge combine join split reorder pages organise organize delete rotate extract',
  accepts: PDF,
  steps: [{
    id: 'pdf-merge', name: 'Merge PDFs', accepts: PDF, options: [],
    async run(files, opts, ctx) {
      ctx?.progress?.(.2, 'Merging');
      const doc = await mergeFiles(files);
      const name = files.length === 1 ? files[0].name : `${baseName(files[0].name)}-merged.pdf`;
      return [pdfFile(await doc.save({ useObjectStreams: true }), name)];
    },
  }],
  render(root, incoming) {
    const sources = [];   // { name, doc, view }
    let pages = [];       // { src, index, rotate, key }
    let seq = 0, dragFrom = -1;
    const thumbs = new Map();
    const err = note();
    const grid = h('div', { class: 'pdf-grid' });
    const status = h('p', { class: 'field-hint' });
    const result = resultBox('pages.zip');
    const saveBtn = fileBtn('Save as one PDF', 'btn primary');
    const splitMode = tabs([['each', 'Every page on its own'], ['ranges', 'By page ranges']], 'each', v => { rangeField.hidden = v !== 'ranges'; });
    const ranges = input({ placeholder: '1-3, 4-6, 7-' });
    const rangeField = field('Ranges (each one becomes a file)', ranges, 'Use page numbers as they are now, e.g. 1-3, 5, 8-');
    rangeField.hidden = true;
    const splitBtn = fileBtn('Split');
    const tools = card(h('h3', {}, 'Save'), row(saveBtn), h('h3', {}, 'Split'), splitMode, rangeField, row(splitBtn), err.el, result.el);
    tools.hidden = true;

    async function add(files) {
      await busy(null, err, async () => {
        for (const f of files) {
          const bytes = await bytesOf(f);
          const doc = await loadDoc(bytes);
          if (doc.isEncrypted) err.error(encryptedNote);
          const view = await openView(bytes);
          const src = sources.push({ name: f.name, doc, view }) - 1;
          for (let i = 0; i < doc.getPageCount(); i++) pages.push({ src, index: i, rotate: 0, key: ++seq });
        }
        draw();
      });
    }
    async function thumb(src, index) {
      const k = src + ':' + index;
      if (!thumbs.has(k)) thumbs.set(k, (async () => {
        const c = await renderPage(await sources[src].view.getPage(index + 1), { width: 260 });
        return c.toDataURL('image/jpeg', .8);
      })());
      return thumbs.get(k);
    }
    const move = (from, to) => {
      if (to < 0 || to >= pages.length || from === to) return;
      const [p] = pages.splice(from, 1);
      pages.splice(to, 0, p);
      draw();
    };
    function draw() {
      result.clear();
      tools.hidden = !pages.length;
      status.textContent = pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''} from ${sources.length} file${sources.length > 1 ? 's' : ''}. Drag to reorder, or use the arrows.` : '';
      grid.replaceChildren(...pages.map((p, i) => {
        const img = h('img', { alt: `Page ${i + 1}`, draggable: false });
        img.style.transform = `rotate(${p.rotate}deg)`;
        thumb(p.src, p.index).then(u => { img.src = u; });
        const b = (label, title, fn) => h('button', { class: 'btn small icon-btn', type: 'button', title, 'aria-label': title, onclick: fn }, label);
        const el = h('div', { class: 'pdf-page', draggable: true, 'data-i': i },
          h('div', { class: 'pdf-thumb' }, img),
          h('div', { class: 'pdf-page-label' }, h('strong', {}, String(i + 1)), sources.length > 1 ? ` · ${baseName(sources[p.src].name)} p${p.index + 1}` : ''),
          h('div', { class: 'pdf-page-btns' },
            b('←', 'Move earlier', () => move(i, i - 1)),
            b('→', 'Move later', () => move(i, i + 1)),
            b(icon('rotate-cw', 16), 'Turn clockwise', () => { p.rotate = (p.rotate + 90) % 360; draw(); }),
            b(icon('copy', 16), 'Duplicate', () => { pages.splice(i + 1, 0, { ...p, key: ++seq }); draw(); }),
            b(icon('trash-2', 16), 'Delete', () => { pages.splice(i, 1); draw(); })));
        el.addEventListener('dragstart', e => { dragFrom = i; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dragover', e => { if (dragFrom < 0) return; e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
        el.addEventListener('dragleave', () => el.classList.remove('over'));
        el.addEventListener('drop', e => {
          if (dragFrom < 0) return;
          e.preventDefault(); e.stopPropagation();
          const from = dragFrom; dragFrom = -1;
          move(from, i);
        });
        return el;
      }));
    }
    const build = list => assemble(sources.map(s => s.doc), list);
    saveBtn.onclick = () => busy(saveBtn, err, async () => {
      if (!pages.length) return;
      const doc = await build(pages);
      const name = sources.length > 1 ? 'merged.pdf' : `${baseName(sources[0].name)}-edited.pdf`;
      result.set(pdfFile(await doc.save({ useObjectStreams: true }), name));
    });
    splitBtn.onclick = () => busy(splitBtn, err, async () => {
      if (!pages.length) return;
      const groups = splitMode.value === 'each' ? pages.map((_, i) => [i]) : parseRanges(ranges.value, pages.length);
      const base = baseName(sources[0].name), out = [];
      for (const g of groups) {
        const doc = await build(g.map(i => pages[i]));
        const label = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;
        out.push(pdfFile(await doc.save({ useObjectStreams: true }), `${base}-${label}.pdf`));
      }
      result.set(out, `${out.length} PDF${out.length > 1 ? 's' : ''}: ${out.map(f => f.name).join(', ')}`);
    });

    root.append(
      card(pdfDrop({ multiple: true, onfiles: add, label: 'Drop PDFs here, or tap to choose (add more any time)' }), status),
      h('div', { class: 'pdf-grid-wrap' }, grid),
      tools,
      card(h('ul', { class: 'tips' },
        h('li', {}, 'Pages keep their text, links and quality — nothing is redrawn.'),
        h('li', {}, 'Bookmarks and form fields from the original files are not carried over.'))));
    if (incoming?.files?.length) add(incoming.files.filter(isPdf));
    return () => { for (const s of sources) s.view.destroy(); };
  },
};

// ---------------------------------------------------------------------------
// 2. Images ⇄ PDF
const PAGE_CHOICES = [['a4', 'A4'], ['letter', 'US Letter'], ['a5', 'A5'], ['a3', 'A3'], ['fit', 'Same size as each picture']];
const imagesPdf = {
  id: 'pdf-images', name: 'Images to PDF', group: 'pdf', icon: 'file-image',
  desc: 'Put pictures into one PDF — or turn PDF pages back into PNG pictures.',
  keywords: 'images photos jpg png to pdf convert scan pictures pdf to png pdf to image export pages',
  accepts: ['image/*', 'application/pdf', '.pdf'],
  steps: [{
    id: 'images-to-pdf', name: 'Pictures to one PDF', accepts: ['image/*'],
    options: [
      { key: 'page', label: 'Page size', type: 'select', value: 'a4', choices: PAGE_CHOICES },
      { key: 'margin', label: 'Margin (mm)', type: 'number', value: 10, min: 0, max: 50, step: 1 },
    ],
    async run(files, opts, ctx) {
      const doc = await imagesToPdf(files, opts, (v, l) => ctx?.progress?.(v * .9, l));
      const name = files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'pictures.pdf';
      return [pdfFile(await doc.save(), name)];
    },
  }, {
    id: 'pdf-to-png', name: 'PDF pages to PNG', accepts: PDF,
    options: [{ key: 'dpi', label: 'Resolution (dpi)', type: 'select', value: 150, choices: [[72, '72 — screen'], [150, '150 — good'], [300, '300 — print']] }],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        out.push(...await pdfToPngs(await bytesOf(f), { dpi: +opts.dpi || 150, name: baseName(f.name) },
          (v, l) => ctx?.progress?.((i + v) / files.length, l)));
      }
      return out;
    },
  }],
  render(root, incoming) {
    const mode = tabs([['to-pdf', 'Pictures → PDF'], ['to-png', 'PDF → pictures']], 'to-pdf', v => { a.hidden = v !== 'to-pdf'; b.hidden = v !== 'to-png'; });
    // Pictures → PDF
    let pics = [];
    const list = h('div', { class: 'pdf-grid small' });
    const page = select(PAGE_CHOICES, 'a4');
    const orient = select([['auto', 'Turn to match each picture'], ['portrait', 'Always portrait'], ['landscape', 'Always landscape']], 'auto');
    const margin = input({ type: 'number', value: 10, min: 0, max: 50, step: 1 });
    const makeBtn = fileBtn('Make PDF', 'btn primary');
    const err1 = note(), res1 = resultBox();
    const drawPics = () => {
      res1.clear();
      makeBtn.disabled = !pics.length;
      list.replaceChildren(...pics.map((p, i) => h('div', { class: 'pdf-page' },
        h('div', { class: 'pdf-thumb' }, h('img', { src: p.url, alt: p.file.name })),
        h('div', { class: 'pdf-page-label' }, h('strong', {}, String(i + 1)), ' ', p.file.name),
        h('div', { class: 'pdf-page-btns' },
          h('button', { class: 'btn small icon-btn', type: 'button', 'aria-label': 'Move earlier', onclick: () => { if (i) { pics.splice(i - 1, 0, ...pics.splice(i, 1)); drawPics(); } } }, '←'),
          h('button', { class: 'btn small icon-btn', type: 'button', 'aria-label': 'Move later', onclick: () => { if (i < pics.length - 1) { pics.splice(i + 1, 0, ...pics.splice(i, 1)); drawPics(); } } }, '→'),
          h('button', { class: 'btn small icon-btn', type: 'button', 'aria-label': 'Remove', onclick: () => { URL.revokeObjectURL(p.url); pics.splice(i, 1); drawPics(); } }, icon('trash-2', 16))))));
    };
    const addPics = files => {
      pics.push(...files.filter(f => (f.type || '').startsWith('image/')).map(file => ({ file, url: URL.createObjectURL(file) })));
      drawPics();
    };
    const dz1 = h('label', { class: 'drop' }, h('input', { type: 'file', hidden: true, accept: 'image/*', multiple: true }), h('span', {}, 'Drop pictures here, or tap to choose (add more any time)'));
    dz1.firstChild.addEventListener('change', e => { addPics([...e.target.files]); e.target.value = ''; });
    dz1.addEventListener('dragover', e => { e.preventDefault(); dz1.classList.add('over'); });
    dz1.addEventListener('dragleave', () => dz1.classList.remove('over'));
    dz1.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz1.classList.remove('over'); addPics([...e.dataTransfer.files]); });
    makeBtn.onclick = () => busy(makeBtn, err1, async () => {
      const doc = await imagesToPdf(pics.map(p => p.file), { page: page.value, margin: +margin.value, orient: orient.value });
      const name = pics.length === 1 ? `${baseName(pics[0].file.name)}.pdf` : 'pictures.pdf';
      const f = pdfFile(await doc.save(), name);
      res1.set(f, `${name} — ${pics.length} page${pics.length > 1 ? 's' : ''}, ${fmtBytes(f.size)}`);
    });
    makeBtn.disabled = true;
    const a = h('div', { class: 'stack' },
      card(dz1, list),
      card(row(field('Page size', page), field('Orientation', orient), field('Margin (mm)', margin)), row(makeBtn), err1.el, res1.el,
        h('p', { class: 'field-hint' }, 'JPEG and PNG go in untouched. Other kinds (WebP, GIF, HEIC on iPhone) are redrawn first; phone photos are turned upright.')));

    // PDF → pictures
    let src = null;
    const dpi = select([['72', '72 dpi — screen'], ['150', '150 dpi — good'], ['300', '300 dpi — print'], ['600', '600 dpi — very large']], '150');
    const which = input({ placeholder: 'All pages' });
    const pngBtn = fileBtn('Make pictures', 'btn primary');
    pngBtn.disabled = true;
    const err2 = note(), res2 = resultBox('pages.zip'), prog = progress();
    const strip = h('div', { class: 'pdf-previews' });
    const loaded = h('p', { class: 'field-hint' });
    const loadPdf = async f => { src = await readPdf(f); loaded.textContent = `${f.name} — ${fmtBytes(f.size)}`; pngBtn.disabled = false; res2.clear(); strip.replaceChildren(); };
    pngBtn.onclick = () => busy(pngBtn, err2, async () => {
      const view = await loadDoc(src.bytes);
      const count = view.getPageCount();
      const sel = which.value.trim() ? parseRanges(which.value, count).flat() : null;
      const files = await pdfToPngs(src.bytes, { dpi: +dpi.value, name: src.name, pages: sel }, (v, l) => { prog.set(v); prog.label(l); });
      prog.hide();
      strip.replaceChildren(...files.slice(0, 6).map(f => { const u = URL.createObjectURL(f); return h('figure', { class: 'pdf-fig' }, h('img', { src: u, class: 'pdf-sheet', alt: f.name }), h('figcaption', {}, f.name)); }));
      const lower = files.filter(f => f.dpi < +dpi.value);
      res2.set(files, `${files.length} PNG${files.length > 1 ? 's' : ''}, ${fmtBytes(files.reduce((s, f) => s + f.size, 0))}${lower.length ? ` — some pages were too big for ${dpi.value} dpi, so they came out at ${lower[0].dpi} dpi` : ''}`);
    });
    const b = h('div', { class: 'stack', hidden: true },
      card(pdfDrop({ onfiles: fs => loadPdf(fs[0]) }), loaded),
      card(row(field('Resolution', dpi), field('Pages', which, 'e.g. 1-3, 5 — blank for all')), row(pngBtn), prog.el, err2.el, res2.el, strip));

    root.append(card(mode), a, b);
    const f = incoming?.files || [];
    if (f.length && f.every(isPdf)) { mode.set('to-png'); a.hidden = true; b.hidden = false; loadPdf(f[0]); }
    else if (f.length) addPics(f);
    return () => pics.forEach(p => URL.revokeObjectURL(p.url));
  },
};

// ---------------------------------------------------------------------------
// 3. Rotate & crop
const rotateCrop = {
  id: 'pdf-rotate-crop', name: 'PDF rotate & crop', group: 'pdf', icon: 'crop',
  desc: 'Turn pages the right way up, or trim the margins off one page or all of them.',
  keywords: 'pdf rotate turn crop trim margins cut page box sideways upside down',
  accepts: PDF,
  steps: [{
    id: 'pdf-rotate', name: 'Rotate every page', accepts: PDF,
    options: [{ key: 'degrees', label: 'Turn', type: 'select', value: 90, choices: [[90, '90° clockwise'], [180, '180°'], [270, '90° anticlockwise']] }],
    async run(files, opts) {
      const out = [];
      for (const f of files) {
        const doc = await rotateDoc(await loadDoc(await bytesOf(f)), +opts.degrees || 90);
        out.push(pdfFile(await doc.save(), f.name));
      }
      return out;
    },
  }],
  render(root, incoming) {
    let src = null, view = null, cur = 0, rot = [], crops = [], vp = null, draft = null, token = 0;
    const err = note(), result = resultBox();
    const canvasWrap = h('div', { class: 'pdf-stage' });
    const box = h('div', { class: 'pdf-cropbox', hidden: true });
    const stage = h('div', { class: 'pdf-stage-inner' }, canvasWrap, box);
    const label = h('span', { class: 'pdf-pager-label' });
    const prev = fileBtn('‹ Previous', 'btn small'), next = fileBtn('Next ›', 'btn small');
    const m = ['top', 'right', 'bottom', 'left'].map(() => input({ type: 'number', value: 0, min: 0, step: 1 }));
    const btns = {
      left: fileBtn('Turn this page ↺'), right: fileBtn('Turn this page ↻'),
      allLeft: fileBtn('Turn all ↺'), allRight: fileBtn('Turn all ↻'),
      cropOne: fileBtn('Crop this page'), cropAll: fileBtn('Crop every page'), uncrop: fileBtn('Remove crops', 'btn ghost'),
      save: fileBtn('Save PDF', 'btn primary'),
    };
    const work = h('div', { class: 'stack', hidden: true },
      card(row(prev, label, next), stage, h('p', { class: 'field-hint' }, 'Drag on the page to draw the area to keep, or type the margins to cut off.')),
      grid(
        card(h('h3', {}, 'Rotate'), row(btns.left, btns.right), row(btns.allLeft, btns.allRight)),
        card(h('h3', {}, 'Crop'), h('div', { class: 'pdf-margins' }, field('Top (mm)', m[0]), field('Right (mm)', m[1]), field('Bottom (mm)', m[2]), field('Left (mm)', m[3])),
          row(btns.cropOne, btns.cropAll, btns.uncrop))),
      card(row(btns.save), err.el, result.el,
        h('p', { class: 'field-hint' }, 'Cropping hides the cut-off part; the hidden content is still inside the file. Use the compressor’s picture mode if it must be gone.')));

    async function open(f) {
      await busy(null, err, async () => {
        view?.destroy();
        src = await readPdf(f);
        const doc = await loadDoc(src.bytes);
        if (doc.isEncrypted) err.error(encryptedNote);
        view = await openView(src.bytes);
        rot = Array(view.numPages).fill(0); crops = Array(view.numPages).fill(null); cur = 0;
        work.hidden = false;
        await show();
      });
    }
    async function show() {
      const t = ++token;
      const page = await view.getPage(cur + 1);
      const width = Math.min(560, canvasWrap.parentElement?.parentElement?.clientWidth - 40 || 560);
      const c = await renderPage(page, { width: Math.max(240, width) * (devicePixelRatio || 1), extraRotate: rot[cur] });
      if (t !== token) return;
      c.style.width = (c.width / (devicePixelRatio || 1)) + 'px';
      c.className = 'pdf-sheet';
      vp = c.viewport.clone({ scale: c.viewport.scale / (devicePixelRatio || 1) });
      canvasWrap.replaceChildren(c);
      label.textContent = `Page ${cur + 1} of ${view.numPages}${rot[cur] ? ` · turned ${rot[cur]}°` : ''}${crops[cur] ? ' · cropped' : ''}`;
      prev.disabled = cur === 0; next.disabled = cur >= view.numPages - 1;
      if (crops[cur]) {
        const [x1, y1, x2, y2] = crops[cur];
        const [ax, ay] = vp.convertToViewportPoint(x1, y1), [bx, by] = vp.convertToViewportPoint(x2, y2);
        draft = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
      } else if (!draft) draft = null;
      drawBox(); toInputs();
    }
    const drawBox = () => {
      box.hidden = !draft;
      if (!draft) return;
      const c = canvasWrap.firstChild, k = c ? c.getBoundingClientRect().width / vp.width || 1 : 1;
      Object.assign(box.style, { left: draft[0] * k + 'px', top: draft[1] * k + 'px', width: (draft[2] - draft[0]) * k + 'px', height: (draft[3] - draft[1]) * k + 'px' });
    };
    const perMM = () => vp.scale * MM;
    const toInputs = () => {
      if (!vp) return;
      const d = draft || [0, 0, vp.width, vp.height];
      const vals = [d[1], vp.width - d[2], vp.height - d[3], d[0]].map(v => Math.max(0, Math.round(v / perMM())));
      m.forEach((el, i) => { el.value = vals[i]; });
    };
    const fromInputs = () => {
      if (!vp) return;
      const [t, r, b, l] = m.map(el => Math.max(0, +el.value || 0) * perMM());
      draft = [l, t, Math.max(l + 4, vp.width - r), Math.max(t + 4, vp.height - b)];
      drawBox();
    };
    m.forEach(el => el.addEventListener('input', fromInputs));
    // Drawing the box with a finger or the mouse.
    let start = null;
    stage.addEventListener('pointerdown', e => {
      if (!vp) return;
      const r = canvasWrap.firstChild.getBoundingClientRect(), k = vp.width / r.width;
      start = [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', e => {
      if (!start) return;
      const r = canvasWrap.firstChild.getBoundingClientRect(), k = vp.width / r.width;
      const x = Math.max(0, Math.min(vp.width, (e.clientX - r.left) * k)), y = Math.max(0, Math.min(vp.height, (e.clientY - r.top) * k));
      draft = [Math.min(start[0], x), Math.min(start[1], y), Math.max(start[0], x), Math.max(start[1], y)];
      drawBox(); toInputs();
    });
    stage.addEventListener('pointerup', () => { start = null; if (draft && (draft[2] - draft[0] < 8 || draft[3] - draft[1] < 8)) { draft = null; drawBox(); toInputs(); } });
    // Turns the margins (in mm, as the page is shown) into a box in a page's own coordinates.
    const rectFor = async i => {
      const page = await view.getPage(i + 1);
      const v = page.getViewport({ scale: 1, rotation: (page.rotate + rot[i]) % 360 });
      const [t, r, b, l] = m.map(el => Math.max(0, +el.value || 0) * MM);
      if (l + r >= v.width - 2 || t + b >= v.height - 2) throw new Error(`The margins are bigger than page ${i + 1}.`);
      const [x1, y1] = v.convertToPdfPoint(l, t), [x2, y2] = v.convertToPdfPoint(v.width - r, v.height - b);
      return [x1, y1, x2, y2];
    };
    const nav = d => { cur = Math.max(0, Math.min(view.numPages - 1, cur + d)); draft = null; result.clear(); show(); };
    prev.onclick = () => nav(-1); next.onclick = () => nav(1);
    const turn = (all, d) => { for (let i = 0; i < rot.length; i++) if (all || i === cur) rot[i] = (rot[i] + d + 360) % 360; draft = null; result.clear(); show(); };
    btns.left.onclick = () => turn(false, -90); btns.right.onclick = () => turn(false, 90);
    btns.allLeft.onclick = () => turn(true, -90); btns.allRight.onclick = () => turn(true, 90);
    btns.cropOne.onclick = () => busy(btns.cropOne, err, async () => { crops[cur] = await rectFor(cur); result.clear(); await show(); toast('Crop set for this page'); });
    btns.cropAll.onclick = () => busy(btns.cropAll, err, async () => { for (let i = 0; i < crops.length; i++) crops[i] = await rectFor(i); result.clear(); await show(); toast('Crop set for every page'); });
    btns.uncrop.onclick = () => { crops.fill(null); draft = null; result.clear(); show(); };
    btns.save.onclick = () => busy(btns.save, err, async () => {
      const { degrees } = await pdfLib();
      const doc = await loadDoc(src.bytes);
      doc.getPages().forEach((p, i) => {
        if (rot[i]) p.setRotation(degrees((p.getRotation().angle + rot[i]) % 360));
        if (crops[i]) cropPage(p, crops[i]);
      });
      const f = pdfFile(await doc.save(), `${src.name}-edited.pdf`);
      const nr = rot.filter(Boolean).length, nc = crops.filter(Boolean).length;
      result.set(f, `${f.name} — ${fmtBytes(f.size)} · ${nr} page${nr === 1 ? '' : 's'} turned, ${nc} cropped`);
    });

    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]) })), work);
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => view?.destroy();
  },
};

// ---------------------------------------------------------------------------
// 4. Page numbers & stamps
const numbers = {
  id: 'pdf-numbers', name: 'PDF page numbers', group: 'pdf', icon: 'list-ordered',
  desc: 'Add page numbers, or stamp words like “CONFIDENTIAL” or “Draft” on every page.',
  keywords: 'pdf page numbers numbering stamp watermark confidential draft footer header bates',
  accepts: PDF,
  steps: [{
    id: 'pdf-number', name: 'Number the pages', accepts: PDF,
    options: [
      { key: 'position', label: 'Where', type: 'select', value: 'bottom-center', choices: POSITIONS.filter(p => p[0] !== 'diagonal') },
      { key: 'start', label: 'First number', type: 'number', value: 1, min: 0, step: 1 },
      { key: 'format', label: 'Style', type: 'select', value: 'n', choices: FORMATS },
      { key: 'skipFirst', label: 'No number on the first page', type: 'checkbox', value: false },
      { key: 'size', label: 'Text size (pt)', type: 'number', value: 11, min: 6, max: 48, step: 1 },
    ],
    async run(files, opts) {
      const out = [];
      for (const f of files) {
        const doc = await stampDoc(await loadDoc(await bytesOf(f)), { ...opts, mode: 'number', start: +opts.start || 0, size: +opts.size || 11 });
        out.push(pdfFile(await doc.save(), f.name));
      }
      return out;
    },
  }],
  render(root, incoming) {
    let src = null, timer = 0, token = 0;
    const mode = tabs([['number', 'Page numbers'], ['stamp', 'Text stamp']], 'number', v => { modeIn.value = v; sync(); });
    const modeIn = { value: 'number' };
    const position = select(POSITIONS, 'bottom-center');
    const format = select(FORMATS, 'n');
    const text = input({ value: 'CONFIDENTIAL' });
    const start = input({ type: 'number', value: 1, min: 0, step: 1 });
    const size = input({ type: 'number', value: 11, min: 4, max: 200, step: 1 });
    const margin = input({ type: 'number', value: 12, min: 0, max: 60, step: 1 });
    const colour = h('input', { type: 'color', value: '#333333', class: 'swatch-input' });
    const opacity = h('input', { type: 'range', min: .1, max: 1, step: .05, value: 1 });
    const skip = checkbox('Leave the first page (cover) without a number');
    const fFormat = field('Style', format), fText = field('Stamp text', text), fStart = field('First number', start), fOpacity = field('Strength', opacity);
    const err = note(), result = resultBox();
    const previews = h('div', { class: 'pdf-previews' });
    const work = h('div', { class: 'stack', hidden: true },
      card(mode, row(fText, field('Where', position), fFormat, fStart),
        row(field('Text size (pt)', size), field('Distance from edge (mm)', margin), field('Colour', colour), fOpacity), skip, err.el, result.el),
      card(h('h3', {}, 'Preview'), previews));
    function sync() {
      const stamp = modeIn.value === 'stamp';
      fText.hidden = !stamp; fFormat.hidden = stamp; fStart.hidden = stamp; fOpacity.hidden = !stamp;
      skip.querySelector('span').textContent = stamp ? 'Leave the first page (cover) unstamped' : 'Leave the first page (cover) without a number';
      if (stamp && position.value === 'bottom-center' && +size.value === 11) { position.value = 'diagonal'; size.value = 72; opacity.value = .35; colour.value = '#c0392b'; }
      if (!stamp && position.value === 'diagonal') { position.value = 'bottom-center'; size.value = 11; opacity.value = 1; colour.value = '#333333'; }
      later();
    }
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
    async function run() {
      if (!src) return;
      const t = ++token;
      await busy(null, err, async () => {
        const doc = await loadDoc(src.bytes);
        await stampDoc(doc, {
          mode: modeIn.value, text: text.value, position: position.value, format: format.value, start: +start.value,
          skipFirst: skip.input.checked, size: +size.value, margin: +margin.value, colour: colour.value, opacity: +opacity.value,
        });
        const bytes = await doc.save();
        if (t !== token) return;
        result.set(pdfFile(bytes, `${src.name}-${modeIn.value === 'stamp' ? 'stamped' : 'numbered'}.pdf`));
        await previewPages(previews, bytes, { max: 3, width: 200 });
      });
    }
    for (const el of [position, format, text, start, size, margin, colour, opacity, skip.input]) el.addEventListener('input', later);
    for (const el of [position, format, skip.input]) el.addEventListener('change', later);
    async function open(f) {
      src = await readPdf(f);
      const doc = await loadDoc(src.bytes);
      if (doc.isEncrypted) err.error(encryptedNote);
      work.hidden = false;
      run();
    }
    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]) })), work);
    sync();
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => clearTimeout(timer);
  },
};

// ---------------------------------------------------------------------------
// 5. Compressor
const compressor = {
  id: 'pdf-compress', name: 'PDF compressor', group: 'pdf', icon: 'shrink',
  desc: 'Make a PDF smaller — losslessly, or by turning pages into JPEG pictures.',
  keywords: 'pdf compress shrink smaller reduce size optimise optimize email attachment',
  accepts: PDF,
  steps: [{
    id: 'pdf-compress', name: 'Make PDF smaller', accepts: PDF,
    options: [
      { key: 'mode', label: 'How', type: 'select', value: 'lossless', choices: [['lossless', 'Lossless (keeps text)'], ['raster', 'Pages to pictures (text not selectable)']] },
      { key: 'dpi', label: 'Picture resolution (dpi)', type: 'number', value: 150, min: 50, max: 300, step: 10, hint: 'Only for “pages to pictures”' },
      { key: 'quality', label: 'JPEG quality', type: 'range', value: .75, min: .3, max: .95, step: .05, hint: 'Only for “pages to pictures”' },
    ],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        const bytes = await bytesOf(f);
        const res = opts.mode === 'raster'
          ? await compressRaster(bytes, { dpi: +opts.dpi || 150, quality: +opts.quality || .75 }, (v, l) => ctx?.progress?.((i + v) / files.length, l))
          : (await compressLossless(bytes)).bytes;
        out.push(pdfFile(res.length < bytes.length ? res : bytes, f.name));
      }
      return out;
    },
  }],
  render(root, incoming) {
    let src = null;
    const mode = tabs([['lossless', 'Lossless'], ['raster', 'Pages to pictures']], 'lossless', v => { modeIn.value = v; rasterOpts.hidden = v !== 'raster'; explain(); });
    const modeIn = { value: 'lossless' };
    const dpi = select([['72', '72 dpi — smallest, screen only'], ['100', '100 dpi'], ['150', '150 dpi — good for reading'], ['200', '200 dpi'], ['300', '300 dpi — print']], '150');
    const quality = h('input', { type: 'range', min: .3, max: .95, step: .05, value: .75 });
    const qLabel = h('span', { class: 'pill' }, '75%');
    quality.addEventListener('input', () => { qLabel.textContent = Math.round(quality.value * 100) + '%'; });
    const rasterOpts = h('div', { class: 'row', hidden: true }, field('Resolution', dpi), field(h('span', {}, 'JPEG quality ', qLabel), quality));
    const how = h('p', { class: 'note' });
    const go = fileBtn('Make it smaller', 'btn primary');
    const err = note(), result = resultBox(), prog = progress();
    const stats = h('div', { class: 'stat-grid', hidden: true });
    const loaded = h('p', { class: 'field-hint' });
    const explain = () => {
      how.textContent = modeIn.value === 'raster'
        ? 'Every page becomes one JPEG picture. Scans and photo-heavy files shrink a lot — but the text can no longer be selected, searched or copied, links stop working, and small print may blur.'
        : 'Re-packs the file without touching any text or picture. Text stays selectable. Files already saved by a good app may not get any smaller.';
    };
    const work = h('div', { class: 'stack', hidden: true }, card(mode, how, rasterOpts, row(go), prog.el, err.el, stats, result.el));
    go.onclick = () => busy(go, err, async () => {
      result.clear(); stats.hidden = true;
      const before = src.bytes.length;
      let after, how2;
      if (modeIn.value === 'raster') {
        after = await compressRaster(src.bytes, { dpi: +dpi.value, quality: +quality.value }, (v, l) => { prog.set(v); prog.label(l); });
        how2 = `pages turned into ${dpi.value} dpi JPEG pictures`;
      } else {
        const r = await compressLossless(src.bytes);
        after = r.bytes; how2 = r.how;
      }
      prog.hide();
      const smaller = after.length < before;
      const pct = Math.round((1 - after.length / before) * 100);
      stats.hidden = false;
      stats.replaceChildren(
        h('div', { class: 'stat' }, h('strong', {}, fmtBytes(before)), h('span', {}, 'Before')),
        h('div', { class: 'stat' }, h('strong', {}, fmtBytes(after.length)), h('span', {}, 'After')),
        h('div', { class: 'stat' + (smaller ? ' good' : '') }, h('strong', {}, smaller ? `−${pct}%` : `+${-pct}%`), h('span', {}, smaller ? 'Smaller' : 'Bigger')));
      const f = pdfFile(smaller ? after : src.bytes, `${src.name}-smaller.pdf`);
      result.set(f, smaller ? `${f.name} — ${how2}.` : `It did not get smaller (${how2}), so this is your original file unchanged.${modeIn.value === 'lossless' ? ' Try “Pages to pictures”.' : ' Try a lower resolution or quality.'}`);
    });
    async function open(f) {
      src = await readPdf(f);
      loaded.textContent = `${f.name} — ${fmtBytes(f.size)}`;
      work.hidden = false; result.clear(); stats.hidden = true;
    }
    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]) }), loaded), work);
    explain();
    if (incoming?.files?.[0]) open(incoming.files[0]);
  },
};

// ---------------------------------------------------------------------------
// 6. Preflight
const preflightTool = {
  id: 'pdf-preflight', name: 'PDF preflight', group: 'pdf', icon: 'file-check',
  desc: 'Is this PDF ready to print? Page sizes, fonts, picture resolution, colour and more.',
  keywords: 'pdf preflight print ready check fonts embedded dpi ppi resolution cmyk rgb bleed info metadata version',
  accepts: PDF, atlas: true,
  render(root, incoming) {
    const err = note(), prog = progress();
    const out = h('div', { class: 'stack' });
    async function open(f) {
      out.replaceChildren();
      await busy(null, err, async () => {
        const { preflight, sizeText } = await import('../lib/pdf-preflight.js');
        const r = await preflight(await bytesOf(f), v => { prog.set(v); prog.label('Checking…'); });
        prog.hide();
        const mark = { good: '✓', warn: '!', bad: '✗' };
        const headline = { good: '✓ Ready to print', warn: '~ Printable, with a few things to know', bad: '✗ Fix these before sending it to print' }[r.verdict];
        const fonts = [...r.fonts.values()];
        const imgs = [...r.images].sort((a, b) => a.ppi - b.ppi);
        const meta = Object.entries(r.meta).filter(([, v]) => v);
        out.append(
          card(h('div', { class: 'verdict ' + (r.verdict === 'good' ? 'good' : r.verdict === 'bad' ? 'bad' : '') }, headline),
            h('p', { class: 'field-hint' }, `${f.name} — ${fmtBytes(f.size)}, ${r.pages.length} page${r.pages.length > 1 ? 's' : ''}, PDF ${r.version}`),
            h('ul', { class: 'pdf-checks' }, r.checks.map(c => h('li', { class: 'pdf-check ' + c.level }, h('span', { class: 'pdf-mark' }, mark[c.level]), h('span', {}, c.text))))),
          card(h('h3', {}, 'Page sizes'),
            h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Size'), h('th', {}, 'Measures'), h('th', {}, 'Pages')),
              r.sizes.map(s => h('tr', {}, h('td', {}, s.name), h('td', {}, sizeText(s.w, s.h)), h('td', {}, String(s.count)))))),
          card(h('h3', {}, `Fonts (${fonts.length})`),
            fonts.length ? h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Font'), h('th', {}, 'Kind'), h('th', {}, 'Embedded')),
              fonts.map(ft => h('tr', {}, h('td', {}, ft.name), h('td', {}, ft.type), h('td', { class: ft.embedded ? 'pdf-ok' : 'pdf-bad' }, ft.embedded ? (ft.subset ? 'Yes (subset)' : 'Yes') : 'No'))))
              : h('p', { class: 'field-hint' }, 'No fonts in this file.')),
          card(h('h3', {}, `Pictures (${imgs.length})`),
            imgs.length ? h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Page'), h('th', {}, 'Pixels'), h('th', {}, 'Printed size'), h('th', {}, 'ppi')),
              imgs.slice(0, 30).map(i => h('tr', {}, h('td', {}, String(i.page)), h('td', {}, `${i.px[0]} × ${i.px[1]}`),
                h('td', {}, `${Math.round(i.placed[0] / MM)} × ${Math.round(i.placed[1] / MM)} mm`),
                h('td', { class: i.ppi < 150 ? 'pdf-bad' : i.ppi < 300 ? 'pdf-warn' : 'pdf-ok' }, String(i.ppi)))))
              : h('p', { class: 'field-hint' }, r.imageError || 'No pictures in this file.'),
            imgs.length > 30 && h('p', { class: 'field-hint' }, `Showing the 30 lowest of ${imgs.length}.`),
            r.imagesChecked < r.pages.length && h('p', { class: 'field-hint' }, `Pictures were checked on the first ${r.imagesChecked} pages.`)),
          card(h('h3', {}, 'Colour'), h('div', { class: 'chips' }, [...r.colour].map(c => h('span', { class: 'pill' }, c))),
            !r.colour.size && h('p', { class: 'field-hint' }, 'No colour information found (black text only).')),
          card(h('h3', {}, 'About the file'), h('dl', { class: 'kv' },
            h('dt', {}, 'PDF version'), h('dd', {}, r.version),
            h('dt', {}, 'Encrypted'), h('dd', {}, r.encrypted ? 'Yes' : 'No'),
            meta.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
          card(h('p', { class: 'field-hint' }, 'Picture resolution is worked out from where each picture sits on the page. Transparency, overprint and hairlines are not checked — a print shop’s own preflight goes further.')));
      });
    }
    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]), sample: 3 }), prog.el, err.el), out);
    if (incoming?.files?.[0]) open(incoming.files[0]);
  },
};

// ---------------------------------------------------------------------------
// 7. Imposer: booklet and N-up
const SHEET_AUTO = [...SHEET_CHOICES, ['auto', 'Just big enough (no scaling)']];
const imposer = {
  id: 'pdf-impose', name: 'Print imposer', group: 'pdf', icon: 'book-copy',
  desc: 'Lay pages out for printing: a folded, stapled booklet, or 2 or 4 pages per sheet.',
  keywords: 'pdf impose imposition booklet saddle stitch fold print n-up 2-up 4-up handout sheets duplex',
  accepts: PDF,
  render(root, incoming) {
    let src = null, timer = 0, token = 0;
    const mode = tabs([['booklet', 'Booklet'], ['2', '2 per sheet'], ['4', '4 per sheet']], 'booklet', v => { modeIn.value = v; later(); });
    const modeIn = { value: 'booklet' };
    const sheet = select(SHEET_AUTO, 'a4');
    const gap = input({ type: 'number', value: 5, min: 0, max: 30, step: 1 });
    const fGap = field('Space round each page (mm)', gap);
    const err = note(), result = resultBox(), how = h('ul', { class: 'tips' });
    const previews = h('div', { class: 'pdf-previews' });
    const work = h('div', { class: 'stack', hidden: true },
      card(mode, row(field('Sheet of paper', sheet), fGap), err.el, result.el, how),
      card(h('h3', {}, 'Sheets'), previews));
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
    for (const el of [sheet, gap]) { el.addEventListener('input', later); el.addEventListener('change', later); }
    async function run() {
      if (!src) return;
      const t = ++token;
      fGap.hidden = modeIn.value === 'booklet';
      await busy(null, err, async () => {
        const doc = await loadDoc(src.bytes);
        const n = doc.getPageCount();
        let res, tips;
        if (modeIn.value === 'booklet') {
          res = await booklet(doc, { sheet: sheet.value });
          tips = [`${n} pages → ${res.sheets} sheet${res.sheets > 1 ? 's' : ''} of paper (${res.sheets * 2} sides)${res.blanks ? `, ${res.blanks} blank page${res.blanks > 1 ? 's' : ''} added at the end to make a multiple of 4` : ''}.`,
            'Print double-sided and choose “flip on short edge”.', 'Keep the sheets in order, fold the stack in half, and staple along the fold.'];
        } else {
          res = await nUp(doc, { per: +modeIn.value, sheet: sheet.value, gap: +gap.value });
          tips = [`${n} pages → ${res.sheets} sheet${res.sheets > 1 ? 's' : ''}, ${res.cols} across × ${res.rows} down.`, 'Pages are scaled down to fit; they read left to right, top to bottom.'];
        }
        const bytes = await res.doc.save();
        if (t !== token) return;
        how.replaceChildren(...tips.map(x => h('li', {}, x)));
        result.set(pdfFile(bytes, `${src.name}-${modeIn.value === 'booklet' ? 'booklet' : modeIn.value + '-up'}.pdf`));
        await previewPages(previews, bytes, { max: 4, width: 300, label: i => modeIn.value === 'booklet' ? `Sheet ${Math.ceil(i / 2)}, ${i % 2 ? 'front' : 'back'}` : `Sheet ${i}` });
      });
    }
    async function open(f) { src = await readPdf(f); work.hidden = false; run(); }
    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]) })), work);
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => clearTimeout(timer);
  },
};

// ---------------------------------------------------------------------------
// 8. Zine imposer
const zineTool = {
  id: 'pdf-zine', name: 'Zine imposer', group: 'pdf', icon: 'scissors',
  desc: 'Turn 8 pages into a one-sheet mini-zine (fold, one cut), or lay pages out for an accordion fold.',
  keywords: 'zine mini zine 8 page one sheet fold cut accordion concertina leaflet pamphlet print',
  accepts: PDF,
  render(root, incoming) {
    let src = null, timer = 0, token = 0;
    const mode = tabs([['zine', 'Mini-zine (8 pages)'], ['accordion', 'Accordion fold']], 'zine', v => { modeIn.value = v; later(); });
    const modeIn = { value: 'zine' };
    const sheet = select([...SHEET_CHOICES, ['auto', 'Just big enough (no scaling)']], 'a4');
    const guides = checkbox('Show fold lines and the cut line', true);
    const sides = select([['1', 'One side — all pages in a row'], ['2', 'Both sides — second half on the back']], '1');
    const fSides = field('Accordion', sides);
    const err = note(), result = resultBox(), how = h('ol', { class: 'tips' });
    const previews = h('div', { class: 'pdf-previews' });
    const work = h('div', { class: 'stack', hidden: true },
      card(mode, row(field('Sheet of paper', sheet), fSides), guides, err.el, result.el),
      grid(card(h('h3', {}, 'Sheet'), previews), card(h('h3', {}, 'How to fold it'), how)));
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
    for (const el of [sheet, sides, guides.input]) el.addEventListener('change', later);
    async function run() {
      if (!src) return;
      const t = ++token;
      const isZine = modeIn.value === 'zine';
      fSides.hidden = isZine;
      await busy(null, err, async () => {
        const doc = await loadDoc(src.bytes);
        const n = doc.getPageCount();
        const res = isZine ? await zine(doc, { sheet: sheet.value, guides: guides.input.checked })
          : await accordion(doc, { sheet: sheet.value === 'a4' && n > 4 ? 'auto' : sheet.value, guides: guides.input.checked, sides: +sides.value });
        const bytes = await res.doc.save();
        if (t !== token) return;
        const steps = isZine ? [
          n !== 8 && (n < 8 ? `Your PDF has ${n} pages; the rest of the 8 panels are left blank.` : `Your PDF has ${n} pages, so this makes ${res.sheets} zines, one per sheet.`),
          'Print one-sided, landscape, at 100% (no “fit to page”).',
          'Fold in half the long way, open, then fold in half the short way and in half again; open out.',
          'Fold in half the short way, and cut along the red line through the folded edge — only the middle.',
          'Open, fold the long way again, and push the ends together so the slit opens into a plus shape.',
          'Fold the pages around so page 1 is the cover. Done.',
        ] : [
          `${res.panels} panels in a row on each sheet${+sides.value === 2 ? ' (sheet 2 is the back)' : ''}.`,
          sheet.value === 'auto' ? 'The sheet is exactly as wide as the pages; print it on long paper or let the printer scale it.' : 'Pages are scaled to fit the sheet.',
          +sides.value === 2 && 'Print double-sided and flip on the long edge.',
          'Fold back and forth along the dotted lines like a fan.',
        ];
        how.replaceChildren(...steps.filter(Boolean).map(s => h('li', {}, s)));
        result.set(pdfFile(bytes, `${src.name}-${isZine ? 'zine' : 'accordion'}.pdf`));
        await previewPages(previews, bytes, { max: 2, width: 420, label: i => `Sheet ${i}` });
      });
    }
    async function open(f) { src = await readPdf(f); work.hidden = false; run(); }
    root.append(card(pdfDrop({ onfiles: fs => open(fs[0]) })), work);
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => clearTimeout(timer);
  },
};

export default [organiser, imagesPdf, rotateCrop, numbers, compressor, preflightTool, imposer, zineTool];
