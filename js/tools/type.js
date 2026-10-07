// Text & type drawer: big text, Unicode, paper, type sizes, fonts, a text
// scratchpad and a document converter. Helpers live in js/lib/type-*.js.
import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, copy, copyBtn, dropzone, downloadBtn, fmtBytes } from '../ui.js';
import { sendBtn, textOf } from '../hub.js';
import * as T from '../lib/type-text.js';
import { PAPER, ALL as PAPERS, toMM, fromMM, fmt as paperFmt, sizeIn } from '../lib/type-paper.js';

const num = (v, d = 4) => Number.isFinite(v) ? String(+v.toFixed(d)) : '';
const parse = el => parseFloat(String(el.value).replace(',', '.'));
const numIn = (value, opts = {}) => { const el = input({ type: 'number', value, ...opts }); el.inputMode = 'decimal'; return el; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Shrinks or grows `inner` until it just fits inside `box` (binary search on font size).
function fitText(box, inner, max = 1600) {
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return 0;
  let lo = 4, hi = Math.min(max, H);
  const fits = s => { inner.style.fontSize = s + 'px'; return inner.scrollWidth <= inner.clientWidth + 1 && inner.scrollHeight <= H + 1; };
  while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  // A little slack: bold glyphs can overhang their boxes at the edges.
  const size = Math.floor(lo * 0.94);
  inner.style.fontSize = size + 'px';
  return size;
}

// --- Large Type ------------------------------------------------------------------
const largeType = {
  id: 'large-type', name: 'Large Type', group: 'type', icon: 'maximize',
  desc: 'Show text as big as the screen allows — a WiFi password or a sign across the room.',
  keywords: 'large type big text sign display fullscreen wifi password show across room banner',
  accepts: ['text'],
  render(root, incoming) {
    const text = textarea({ rows: 3, mono: false, placeholder: 'Type something to show big', value: 'Selamat datang!' });
    const theme = tabs([['dark', 'Dark'], ['light', 'Light'], ['contrast', 'High contrast']], 'dark', () => draw());
    const boxes = checkbox('Character boxes — numbers every letter, for passwords');
    const inner = h('div', { class: 'ty-lt-inner' });
    const stage = h('div', { class: 'ty-lt-stage', role: 'button', tabindex: 0, title: 'Tap for full screen', 'aria-label': 'Show full screen' }, inner);
    const size = h('span', { class: 'field-hint' });
    let full = null;

    function fill(el) {
      const t = text.value || ' ';
      el.classList.toggle('boxes', boxes.input.checked);
      if (!boxes.input.checked) { el.textContent = t; return; }
      el.replaceChildren(...[...t.replace(/\n/g, ' ')].map((c, i) => h('span', {
        class: 'ty-lt-ch ' + (/\d/.test(c) ? 'digit' : /\p{L}/u.test(c) ? (c === c.toUpperCase() && c !== c.toLowerCase() ? 'upper' : 'letter') : 'sym'),
      }, h('b', {}, c === ' ' ? '␣' : c), h('small', {}, i + 1))));
    }
    function draw() {
      fill(inner);
      stage.dataset.look = theme.value;
      const s = fitText(stage, inner);
      size.textContent = s ? `Fits at ${s} px here. Tap the panel for full screen; tap again or press Esc to close.` : '';
      if (full) { full.dataset.look = theme.value; fill(full.firstChild); fitText(full, full.firstChild, 4000); }
    }
    function close() {
      if (!full) return;
      if (document.fullscreenElement === full) document.exitFullscreen?.().catch(() => {});
      full.remove(); full = null;
      removeEventListener('keydown', esc);
    }
    const esc = e => { if (e.key === 'Escape') close(); };
    function open() {
      full = h('div', { class: 'ty-lt-full', 'data-look': theme.value, onclick: close }, h('div', { class: 'ty-lt-inner' }));
      document.body.append(full);
      addEventListener('keydown', esc);
      const go = () => { if (full) { fill(full.firstChild); fitText(full, full.firstChild, 4000); } };
      go();
      if (full.requestFullscreen && document.fullscreenEnabled) full.requestFullscreen().then(() => setTimeout(go, 120)).catch(() => {});
    }
    const onFs = () => { if (full && !document.fullscreenElement) close(); else if (full) setTimeout(() => full && fitText(full, full.firstChild, 4000), 60); };
    document.addEventListener('fullscreenchange', onFs);
    stage.addEventListener('click', open);
    stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    const ro = new ResizeObserver(() => draw());
    ro.observe(stage);
    const onResize = () => full && fitText(full, full.firstChild, 4000);
    addEventListener('resize', onResize);

    root.append(
      card(field('Text', text), row(theme), boxes, size),
      h('div', { class: 'card ty-lt-card' }, stage),
      h('p', { class: 'field-hint' }, 'Turn your phone sideways for longer text. On iPhone, full screen fills the browser window (Safari does not allow true full screen for pages).'));
    on(text, draw);
    boxes.input.addEventListener('change', draw);
    if (incoming) textOf(incoming).then(t => { if (t != null) { text.value = t.slice(0, 2000); draw(); } });
    return () => { close(); ro.disconnect(); removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); };
  },
};

// --- Glyph browser -------------------------------------------------------------------
const glyphs = {
  id: 'glyphs', name: 'Glyph browser', group: 'type', icon: 'letter-text',
  desc: 'Browse Unicode by block or search by name; copy any character, its code and escapes.',
  keywords: 'unicode glyph character map symbol emoji arrow box drawing jawi arabic code point utf-8 utf-16 html entity escape charmap',
  accepts: ['text'],
  render(root, incoming) {
    const status = note();
    status.info('Loading character names…');
    const q = input({ placeholder: 'Search: snowman, arrow, U+2603 — or paste characters' });
    q.type = 'search';
    const groupSel = select([]);
    const blockSel = select([]);
    const gridEl = h('div', { class: 'ty-glyph-grid', role: 'listbox', 'aria-label': 'Characters' });
    const big = h('div', { class: 'ty-glyph-big' });
    const name = h('p', { class: 'big-say ty-glyph-name' });
    const where = h('p', { class: 'field-hint' });
    const outs = ['Character', 'Code point', 'Decimal', 'UTF-8 bytes', 'UTF-16 units', 'HTML', 'CSS', 'JavaScript', 'URL encoded'].map(l => output(l));
    let data = null, current = null;
    const detail = card(
      h('div', { class: 'ty-glyph-head' }, big, h('div', {}, name, where)),
      h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', onclick: () => current != null && copy(String.fromCodePoint(current)) }, 'Copy character'),
        sendBtn(() => current != null ? { text: String.fromCodePoint(current) } : null)),
      h('div', { class: 'ty-glyph-outs' }, outs.map(o => o.el)));
    detail.hidden = true;

    let G;
    function pick(cp) {
      current = cp;
      const n = data.names.get(cp) || '';
      const f = G.facts(cp);
      big.textContent = G.shown(cp, n);
      name.textContent = n || 'Name not in the bundled list';
      where.textContent = [G.blockOf(data, cp), G.JAWI.includes(cp) ? 'Used in Jawi (Malay in Arabic script)' : ''].filter(Boolean).join(' · ');
      [f.char, f.code, f.decimal, f.utf8, f.utf16, f.html, f.css, f.js, f.url].forEach((v, i) => outs[i].set(v));
      detail.hidden = false;
      for (const b of gridEl.querySelectorAll('.on')) b.classList.remove('on');
      gridEl.querySelector(`[data-cp="${cp}"]`)?.classList.add('on');
    }
    function show(list, msg) {
      gridEl.replaceChildren(...list.map(cp => h('button', { type: 'button', class: 'ty-glyph', 'data-cp': cp, title: `${G.uplus(cp)} ${data.names.get(cp) || ''}` }, G.shown(cp, data.names.get(cp)))));
      status.info(msg);
    }
    function showBlock() {
      const b = data.blocks.find(x => x[2] === blockSel.value);
      if (!b) return;
      const list = [];
      for (let cp = b[0]; cp <= b[1]; cp++) if (data.names.has(cp)) list.push(cp);
      show(list, `${b[2]} — ${list.length} characters, ${G.uplus(b[0])}–${G.uplus(b[1])}`);
    }
    function fillBlocks() {
      const g = G.GROUPS.find(x => x[0] === groupSel.value);
      blockSel.replaceChildren(...g[1].map(n => h('option', { value: n }, n)));
      showBlock();
    }
    function run() {
      if (!data) return;
      const s = q.value.trim();
      blockSel.disabled = groupSel.disabled = !!s;
      if (!s) { showBlock(); return; }
      const list = G.search(data, s);
      show(list, list.length ? `${list.length === 300 ? 'First 300' : list.length} match${list.length === 1 ? '' : 'es'} for “${s}”` : `Nothing called “${s}” in the ${data.names.size.toLocaleString()} names here.`);
      if (list.length === 1 || (list.length && data.names.get(list[0]) === s.toUpperCase())) pick(list[0]);
    }
    gridEl.addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (b) pick(+b.dataset.cp); });
    groupSel.addEventListener('change', fillBlocks);
    blockSel.addEventListener('change', showBlock);

    root.append(
      card(field('Search', q), grid(field('Group', groupSel), field('Block', blockSel)), status.el),
      detail,
      card(gridEl),
      h('p', { class: 'field-hint' }, 'Names come from the Unicode Character Database for about 10,000 commonly used characters (Latin, punctuation, arrows, maths, box drawing, currency, emoji, Arabic and Jawi, Greek, Cyrillic and more). Emoji made of several characters, such as flags or skin tones, show as their parts. Whether a character draws depends on your device’s fonts.'));

    (async () => {
      G = await import('../lib/type-glyphs.js');
      data = await G.loadNames();
      groupSel.replaceChildren(...G.GROUPS.map(([n]) => h('option', { value: n }, n)));
      fillBlocks();
      on(q, run, 'input', 150);
      if (incoming) { const t = await textOf(incoming); if (t) { q.value = t.slice(0, 60); run(); } }
    })().catch(e => status.error('Could not load the character names: ' + e.message));
  },
};

// --- Paper sizes -------------------------------------------------------------------------
const paper = {
  id: 'paper-sizes', name: 'Paper sizes', group: 'type', icon: 'ruler-dimension-line',
  desc: 'A4, Letter, B5, envelopes, photo prints and cards — in mm, inches, points or pixels.',
  keywords: 'paper size a4 a3 a5 letter legal tabloid b5 jis envelope dl c5 photo 4r 4x6 business card dimensions mm inches points pixels dpi print',
  render(root) {
    const groupSel = select(PAPER.map(g => [g.id, g.name]), 'iso-a');
    const unit = tabs(['mm', 'cm', 'in', 'pt', 'px'], 'mm', () => draw());
    const dpi = numIn(300, { min: 36, max: 2400, step: 1 });
    const dpiField = field('Pixels per inch (DPI)', dpi, '300 for print, 96 for screens (CSS pixels), 72 for old Mac points.');
    const land = checkbox('Landscape');
    const compare = select([['', 'Nothing'], ...PAPERS.map(s => [s.name, s.name])], 'Letter');
    const tbody = h('tbody');
    const table = h('table', { class: 'table ty-paper-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Size'), h('th', {}, 'Width × height'))), tbody);
    const say = h('p', { class: 'big-say' });
    const kv = h('dl', { class: 'kv wide' });
    const groupNote = h('p', { class: 'field-hint' });
    const svgBox = h('div', { class: 'ty-paper-svg' });
    let chosen = 'A4';

    const dims = s => { let w = toMM(s.w, s.unit), hh = toMM(s.h, s.unit); if (land.input.checked) [w, hh] = [Math.max(w, hh), Math.min(w, hh)]; return [w, hh]; };
    function draw() {
      const g = PAPER.find(x => x.id === groupSel.value);
      const u = unit.value, d = parse(dpi) || 96;
      dpiField.hidden = u !== 'px';
      groupNote.textContent = g.note;
      const list = PAPERS.filter(s => s.group === g.id);
      if (!list.some(s => s.name === chosen)) chosen = list[Math.min(4, list.length - 1)].name;
      tbody.replaceChildren(...list.map(s => {
        const [w, hh] = dims(s);
        return h('tr', { class: s.name === chosen ? 'on' : '', tabindex: 0, onclick: () => { chosen = s.name; draw(); }, onkeydown: e => { if (e.key === 'Enter') { chosen = s.name; draw(); } } },
          h('th', {}, s.name), h('td', {}, `${paperFmt(fromMM(w, u, d), u)} × ${paperFmt(fromMM(hh, u, d), u)} ${u}`));
      }));
      const s = PAPERS.find(x => x.name === chosen);
      const [w, hh] = dims(s);
      say.textContent = `${s.name}: ${paperFmt(fromMM(w, u, d), u)} × ${paperFmt(fromMM(hh, u, d), u)} ${u}`;
      const at = { ...s, w, h: hh, unit: 'mm' };
      kv.replaceChildren(
        ...['mm', 'cm', 'in', 'pt'].flatMap(x => [h('dt', {}, { mm: 'Millimetres', cm: 'Centimetres', in: 'Inches', pt: 'Points (PDF)' }[x]), h('dd', {}, sizeIn(at, x))]),
        ...[72, 96, 150, 300].flatMap(x => [h('dt', {}, `Pixels at ${x} DPI`), h('dd', {}, sizeIn(at, 'px', x))]),
        h('dt', {}, 'Aspect ratio'), h('dd', {}, `1 : ${num(Math.max(w, hh) / Math.min(w, hh), 3)}`),
        h('dt', {}, 'Area'), h('dd', {}, `${num(w * hh / 1e6, 4)} m²`));
      // Scaled comparison: the drawer's sizes faintly, the chosen one solid, the comparison dashed.
      const others = list.map(dims);
      const cmp = compare.value && PAPERS.find(x => x.name === compare.value);
      const all = [...others, [w, hh], ...(cmp ? [dims(cmp)] : [])];
      const W = Math.max(...all.map(a => a[0])), H = Math.max(...all.map(a => a[1]));
      const pad = W * 0.02, ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${s.name}${cmp ? ' compared with ' + cmp.name : ''}, to scale`);
      const rect = (rw, rh, cls) => { const r = document.createElementNS(ns, 'rect'); Object.entries({ x: 0, y: H - rh, width: rw, height: rh, class: cls }).forEach(([k, v]) => r.setAttribute(k, v)); r.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(r); };
      others.forEach(([a, b]) => rect(a, b, 'faint'));
      rect(w, hh, 'main');
      if (cmp) { const [a, b] = dims(cmp); rect(a, b, 'cmp'); }
      svgBox.replaceChildren(svg, h('p', { class: 'field-hint' },
        h('span', { class: 'ty-key main' }), ` ${s.name}  `, cmp ? [h('span', { class: 'ty-key cmp' }), ` ${cmp.name}  `] : '', h('span', { class: 'ty-key faint' }), ` other ${g.name} sizes`));
    }
    root.append(
      card(grid(field('Kind', groupSel), field('Compare with', compare)), row(unit, land), dpiField, groupNote),
      grid(card(table), h('div', { class: 'stack ty-stack' }, card(say, kv), card(h('h3', {}, 'To scale'), svgBox))));
    for (const el of [groupSel, compare, dpi]) el.addEventListener('input', draw);
    for (const el of [groupSel, compare]) el.addEventListener('change', draw);
    land.input.addEventListener('change', draw);
    draw();
  },
};

// --- Line height calculator -------------------------------------------------------------
export function suggestLineHeight(fontPx, measureCh, gridPx = 0) {
  let ratio = 1.35 + 0.25 * (clamp(measureCh, 30, 100) - 45) / 30;
  ratio -= Math.max(0, fontPx - 18) * 0.012;
  ratio = clamp(ratio, 1.1, 1.8);
  let px = fontPx * ratio;
  if (gridPx > 0) {
    px = Math.max(gridPx, Math.round(px / gridPx) * gridPx);
    while (px < fontPx * 1.05) px += gridPx;
  }
  return { px, ratio: px / fontPx };
}

const SAMPLE = 'Typography is the craft of making words easy to read. A comfortable line holds about 45 to 75 characters, and the gap between lines grows as lines get longer, so the eye can find the start of the next one without effort. Big headings need less room between lines than body text does.';
const lineHeight = {
  id: 'line-height', name: 'Line height calculator', group: 'type', icon: 'pilcrow',
  desc: 'A comfortable line height from font size and line length, with a live preview and baseline grid.',
  keywords: 'line height leading css typography measure line length baseline grid vertical rhythm rem unitless',
  render(root) {
    const size = numIn(16, { min: 6, max: 200, step: 1 });
    const measure = h('input', { type: 'range', min: 30, max: 100, step: 1, value: 66 });
    const mLabel = h('span', { class: 'field-hint' });
    const rootSize = numIn(16, { min: 4, max: 64, step: 1 });
    const gridSel = select([['0', 'Off'], ['4', '4 px'], ['6', '6 px'], ['8', '8 px'], ['12', '12 px']], '0');
    const sample = textarea({ rows: 3, mono: false, value: SAMPLE });
    const unitless = output('Unitless (best for CSS)'), px = output('Pixels'), rem = output('rem'), css = output('CSS', { multiline: true, rows: 4 });
    const advice = h('p', { class: 'field-hint' });
    const preview = h('p', { class: 'ty-lh-preview' });
    const scale = h('dl', { class: 'kv' });
    function run() {
      const fs = parse(size), m = +measure.value, base = parse(rootSize) || 16, g = +gridSel.value;
      mLabel.textContent = `${m} characters per line`;
      if (!(fs > 0)) return;
      const r = suggestLineHeight(fs, m, g);
      unitless.set(num(r.ratio, 3)); px.set(num(r.px, 2) + 'px'); rem.set(num(r.px / base, 4) + 'rem');
      css.set(`font-size: ${num(fs / base, 4)}rem;\nline-height: ${num(r.ratio, 3)};\nmax-width: ${m}ch;${g ? `\n/* baseline grid: ${g}px — space blocks in multiples of ${num(r.px, 2)}px */` : ''}`);
      advice.textContent = m < 45 ? 'Short lines: tighter leading reads fine, but very short lines feel choppy.' : m > 75 ? 'Long lines are tiring: the extra leading helps, but consider a narrower column.' : 'A comfortable measure.';
      Object.assign(preview.style, { fontSize: fs + 'px', lineHeight: num(r.ratio, 3), maxWidth: m + 'ch', backgroundSize: g ? `100% ${g}px` : '' });
      preview.classList.toggle('grid', !!g);
      preview.textContent = sample.value || SAMPLE;
      scale.replaceChildren(...[['Half line', 0.5], ['One line (paragraph gap)', 1], ['Two lines (section gap)', 2], ['Three lines', 3]]
        .flatMap(([l, k]) => [h('dt', {}, l), h('dd', {}, `${num(r.px * k, 2)}px · ${num(r.px * k / base, 4)}rem`)]));
    }
    root.append(
      card(grid(field('Font size (px)', size), field('Root font size (px)', rootSize, 'What 1rem is — 16 in most browsers.')),
        field('Line length (measure)', measure), mLabel,
        field('Baseline grid', gridSel, 'Snaps the line height to a multiple of the grid, for vertical rhythm.')),
      card(grid(unitless.el, px.el), rem.el, advice, css.el),
      card(h('h3', {}, 'Preview'), preview, field('Preview text', sample)),
      card(h('h3', {}, 'Spacing that keeps the rhythm'), scale));
    on([size, measure, rootSize, gridSel, sample], run);
    gridSel.addEventListener('change', run);
  },
};

// --- PX to REM ------------------------------------------------------------------------------
const pxRem = {
  id: 'px-rem', name: 'PX to REM', group: 'type', icon: 'scaling',
  desc: 'Convert px, rem, em, pt and vw, with your own base size and screen width.',
  keywords: 'px rem em pt vw convert css units font size base 16 root pixel viewport',
  render(root) {
    const base = numIn(16, { min: 1, step: 1 }), parent = numIn(16, { min: 1, step: 1 }), vp = numIn(1440, { min: 100, step: 1 });
    const f = { px: numIn(24), rem: numIn(''), em: numIn(''), pt: numIn(''), vw: numIn('') };
    const toPx = { px: v => v, rem: v => v * parse(base), em: v => v * parse(parent), pt: v => v / 0.75, vw: v => v * parse(vp) / 100 };
    const fromPx = { px: v => v, rem: v => v / parse(base), em: v => v / parse(parent), pt: v => v * 0.75, vw: v => v / parse(vp) * 100 };
    let src = 'px';
    function sync(from = src) {
      src = from;
      const v = toPx[from](parse(f[from]));
      for (const k in f) if (k !== from) f[k].value = Number.isFinite(v) ? num(fromPx[k](v), 4) : '';
      table();
    }
    const tbody = h('tbody');
    function table() {
      tbody.replaceChildren(...[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96].map(p => h('tr', {},
        h('td', {}, p + 'px'), h('td', {}, num(fromPx.rem(p), 4) + 'rem'), h('td', {}, num(fromPx.pt(p), 2) + 'pt'), h('td', {}, num(fromPx.vw(p), 3) + 'vw'))));
    }
    for (const k in f) f[k].addEventListener('input', () => sync(k));
    for (const s of [base, parent, vp]) s.addEventListener('input', () => sync('px'));
    root.append(
      card(h('div', { class: 'ty-units' }, ...Object.keys(f).map(k => field({ px: 'Pixels (px)', rem: 'rem', em: 'em', pt: 'Points (pt)', vw: 'Viewport width (vw)' }[k], f[k])))),
      card(h('div', { class: 'ty-units' }, field('Root font size (px)', base, '1rem — 16 in most browsers'), field('Parent font size (px)', parent, '1em inside the element'), field('Screen width (px)', vp, '100vw'))),
      card(h('h3', {}, 'Common sizes'), h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'px'), h('th', {}, 'rem'), h('th', {}, 'pt'), h('th', {}, 'vw'))), tbody)),
      h('p', { class: 'field-hint' }, 'CSS fixes 1pt at 4/3 px (96 px per inch), whatever the real screen.'));
    sync('px');
  },
};

// --- Typography units ---------------------------------------------------------------------------
const UNITS = [
  ['pt', 'Points (pt)', 1 / 72], ['pc', 'Picas (pc)', 1 / 6], ['px', 'Pixels (px)', null], ['mm', 'Millimetres', 1 / 25.4],
  ['cm', 'Centimetres', 1 / 2.54], ['in', 'Inches', 1], ['em', 'em', null], ['q', 'Q (quarter-mm)', 0.25 / 25.4],
];
const typeUnits = {
  id: 'type-units', name: 'Typography units', group: 'type', icon: 'ruler',
  desc: 'Points, picas, pixels, millimetres, inches, em and Q — at any DPI.',
  keywords: 'typography units point pica pixel mm cm inch em q kyu convert dpi print type size',
  render(root) {
    const dpi = numIn(96, { min: 1, step: 1 }), em = numIn(16, { min: 0.1, step: 1 });
    const f = Object.fromEntries(UNITS.map(([k]) => [k, numIn('')]));
    f.pt.value = 12;
    const inches = k => k === 'px' ? 1 / parse(dpi) : k === 'em' ? parse(em) / parse(dpi) : UNITS.find(u => u[0] === k)[2];
    let src = 'pt';
    function sync(from = src) {
      src = from;
      const inch = parse(f[from]) * inches(from);
      for (const [k] of UNITS) if (k !== from) f[k].value = Number.isFinite(inch) ? num(inch / inches(k), 4) : '';
    }
    for (const [k] of UNITS) f[k].addEventListener('input', () => sync(k));
    for (const s of [dpi, em]) s.addEventListener('input', () => sync());
    root.append(
      card(grid(field('Pixels per inch (DPI)', dpi, '96 is the CSS pixel; phones are 300+ physical pixels per inch.'), field('1 em in pixels', em, 'The font size em is measured against.'))),
      card(h('div', { class: 'ty-units' }, UNITS.map(([k, l]) => field(l, f[k])))),
      card(h('h3', {}, 'How they relate'), h('ul', { class: 'tips' },
        h('li', {}, '1 inch = 72 points = 6 picas = 25.4 mm.'),
        h('li', {}, '1 pica = 12 points. Q (kyu) is a Japanese unit: 1 Q = ¼ mm, used for type sizes there.'),
        h('li', {}, 'Pixels depend on DPI: at the CSS 96, 12 pt = 16 px.'))));
    sync('pt');
  },
};

// --- Font file explorer ---------------------------------------------------------------------------
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];
const fontExplorer = {
  id: 'font-explorer', name: 'Font file explorer', group: 'type', icon: 'type-outline',
  desc: 'Open a TTF, OTF, WOFF or WOFF2 font: names, licence, glyphs, features, variable axes and a tester.',
  keywords: 'font file explorer viewer inspect ttf otf woff woff2 glyphs opentype features variable axes licence metadata tester specimen',
  accepts: [...FONT_EXT, 'font/ttf', 'font/otf', 'font/woff', 'font/woff2'],
  render(root, incoming) {
    const drop = dropzone({ accept: FONT_EXT.join(','), label: 'Drop a font file here (TTF, OTF, WOFF, WOFF2), or tap to choose one', onfiles: f => load(f[0]) });
    const info = note();
    const out = h('div', { class: 'stack ty-stack' });
    let face = null, fam = null;
    root.append(card(drop, info.el), out);

    async function load(file) {
      out.replaceChildren();
      info.info(`Reading ${file.name}…`);
      let r;
      try {
        const { readFont, nameOf, featureTags, featureName, axes, DEFAULT_ON } = await import('../lib/type-font.js');
        r = await readFont(file);
        r.nameOf = nameOf; r.featureTags = featureTags; r.featureName = featureName; r.axes = axes; r.DEFAULT_ON = DEFAULT_ON;
      } catch (e) { info.error(e.message || String(e)); return; }
      const { font, format } = r;
      info.info(`${file.name} — ${format}, ${fmtBytes(file.size)}`);
      if (face) document.fonts.delete(face);
      fam = 'tb-font-' + Math.random().toString(36).slice(2, 8);
      try { face = new FontFace(fam, r.buf); await face.load(); document.fonts.add(face); }
      catch { face = null; }

      const N = k => r.nameOf(font, k);
      const meta = [
        ['Family', N('preferredFamily') || N('fontFamily')], ['Style', N('preferredSubfamily') || N('fontSubfamily')], ['Full name', N('fullName')],
        ['Version', N('version')], ['Designer', N('designer')], ['Designer URL', N('designerURL')], ['Maker', N('manufacturer')], ['Vendor URL', N('manufacturerURL')],
        ['Copyright', N('copyright')], ['Trademark', N('trademark')], ['Licence URL', N('licenseURL')], ['Format', format],
        ['Units per em', font.unitsPerEm], ['Ascender / descender', `${font.ascender} / ${font.descender}`], ['Glyphs', font.numGlyphs],
      ].filter(([, v]) => v !== '' && v != null);
      const licence = N('license');
      const feats = r.featureTags(font);
      const ax = r.axes(font);

      // Type tester
      const sample = textarea({ rows: 2, mono: false, value: 'The quick brown fox jumps over the lazy dog. 0123456789 — fi fl ffi' });
      const size = h('input', { type: 'range', min: 10, max: 160, value: 48 });
      const tester = h('div', { class: 'ty-font-tester', style: { fontFamily: `'${fam}', system-ui` } });
      const featBoxes = feats.map(t => { const c = checkbox(`${t}${r.featureName(t) ? ' — ' + r.featureName(t) : ''}`, r.DEFAULT_ON.has(t)); c.tag = t; return c; });
      const sliders = ax.map(a => {
        const s = h('input', { type: 'range', min: a.min, max: a.max, step: a.max - a.min > 20 ? 1 : 0.1, value: a.def, 'data-axis': a.tag });
        const v = h('span', { class: 'pill' }, num(a.def, 1));
        s.addEventListener('input', () => { v.textContent = num(+s.value, 1); test(); });
        return { a, s, el: h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, `${a.name} (${a.tag}) ${a.min}–${a.max}`), v), s) };
      });
      function test() {
        tester.textContent = sample.value;
        tester.style.fontSize = size.value + 'px';
        tester.style.fontFeatureSettings = featBoxes.map(c => `"${c.tag}" ${c.input.checked ? 1 : 0}`).join(', ') || 'normal';
        tester.style.fontVariationSettings = sliders.map(x => `"${x.a.tag}" ${x.s.value}`).join(', ') || 'normal';
      }
      sample.addEventListener('input', test); size.addEventListener('input', test);
      featBoxes.forEach(c => c.input.addEventListener('change', test));

      // Glyph grid
      const gridEl = h('div', { class: 'ty-font-glyphs' });
      let shown = 0;
      const more = h('button', { class: 'btn small', type: 'button', onclick: () => addGlyphs(240) }, 'Show more glyphs');
      const asc = font.ascender, desc = font.descender, upm = font.unitsPerEm;
      function addGlyphs(n) {
        const end = Math.min(font.numGlyphs, shown + n);
        for (let i = shown; i < end; i++) {
          let g; try { g = font.glyphs.get(i); } catch { continue; }
          let d = '';
          try { d = g.getPath(0, asc, upm).toPathData(1); } catch {}
          const w = Math.max(g.advanceWidth || upm / 2, 1);
          const cps = g.unicodes?.length ? g.unicodes : g.unicode != null ? [g.unicode] : [];
          const label = cps.length ? 'U+' + cps[0].toString(16).toUpperCase().padStart(4, '0') : '—';
          const cell = h('figure', { class: 'ty-font-glyph', title: `#${i} ${g.name || ''} ${label}` });
          cell.innerHTML = `<svg viewBox="0 0 ${w} ${asc - desc}" aria-hidden="true"><line x1="0" x2="${w}" y1="${asc}" y2="${asc}" class="base"/><path d="${d}"/></svg>`;
          cell.append(h('figcaption', {}, h('span', {}, g.name || `#${i}`), h('small', {}, label)));
          gridEl.append(cell);
        }
        shown = end;
        more.hidden = shown >= font.numGlyphs;
        more.textContent = `Show more glyphs (${(font.numGlyphs - shown).toLocaleString()} left)`;
      }
      addGlyphs(240);

      const send = sendBtn(() => ({ files: [file] }));
      out.append(
        card(h('div', { class: 'ty-font-hero', style: { fontFamily: `'${fam}', system-ui` } }, N('fullName') || N('fontFamily') || file.name),
          face ? null : h('p', { class: 'note error' }, 'This browser could not load the font for previews, so the tester shows a fallback font.'),
          h('dl', { class: 'kv wide ty-font-meta' }, meta.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
          licence ? h('details', { class: 'ty-licence' }, h('summary', {}, 'Licence text'), h('pre', { class: 'mono-block' }, licence)) : h('p', { class: 'field-hint' }, 'No licence text inside this font — check where you got it before using it in a project.'),
          row(send)),
        card(h('h3', {}, 'Type tester'), field('Text', sample), field('Size', size), tester,
          sliders.length ? h('div', { class: 'stack ty-stack' }, h('h3', {}, `Variable axes (${sliders.length})`), sliders.map(x => x.el)) : h('p', { class: 'field-hint' }, 'Not a variable font — no axes to slide.')),
        card(h('h3', {}, `OpenType features (${feats.length})`),
          feats.length ? h('div', { class: 'checks ty-font-feats' }, featBoxes) : h('p', { class: 'field-hint' }, 'This font lists no OpenType features.'),
          h('p', { class: 'field-hint' }, 'Tick a feature to try it in the tester above. Some only change certain letters or numbers.')),
        card(h('h3', {}, `Glyphs (${font.numGlyphs.toLocaleString()})`), gridEl, more));
      test();
    }
    if (incoming?.files?.[0]) load(incoming.files[0]);
    return () => { if (face) document.fonts.delete(face); };
  },
};

// --- Text scratchpad --------------------------------------------------------------------------------
const scratch = {
  id: 'scratchpad', name: 'Text scratchpad', group: 'type', icon: 'notebook-pen',
  desc: 'A quiet place to write, with one-tap sort, dedupe, trim, find & replace and case changes.',
  keywords: 'text scratchpad editor notes sort lines remove duplicates dedupe trim empty reverse shuffle number find replace regex wrap join split uppercase lowercase title case accents smart quotes focus',
  accepts: ['text', '.txt', '.md', '.markdown', 'text/plain', 'text/markdown'],
  render(root, incoming) {
    const ta = textarea({ rows: 14, mono: false, placeholder: 'Write or paste here…' });
    ta.classList.add('ty-scratch');
    ta.spellcheck = true;
    const counts = h('p', { class: 'ty-counts', 'aria-live': 'polite' });
    const undoStack = [];
    const undoBtn = h('button', { class: 'btn small', type: 'button', disabled: true, onclick: () => { if (undoStack.length) { ta.value = undoStack.pop(); changed(); } } }, 'Undo');
    const msg = note();
    function changed() {
      const c = T.counts(ta.value);
      counts.textContent = `${c.words.toLocaleString()} words · ${c.chars.toLocaleString()} characters · ${c.lines.toLocaleString()} lines`;
      undoBtn.disabled = !undoStack.length;
    }
    function apply(fn, say) {
      const before = ta.value;
      const after = fn(before);
      if (after == null) return;
      if (after === before) { msg.info(say ? `${say}: nothing changed.` : 'Nothing changed.'); return; }
      undoStack.push(before); if (undoStack.length > 50) undoStack.shift();
      ta.value = after;
      msg.info(say ? `${say} done — Undo puts it back.` : '');
      changed();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const chip = (label, fn) => h('button', { class: 'chip', type: 'button', onclick: () => apply(fn, label) }, label);
    const sep = input({ value: ', ', placeholder: 'Separator' });
    const cols = numIn(72, { min: 10, max: 400, step: 1 });
    const find = input({ placeholder: 'Find' }), repl = input({ placeholder: 'Replace with' });
    const rx = checkbox('Regular expression'), mc = checkbox('Match case');
    const doReplace = () => apply(t => {
      const r = T.replace(t, find.value, repl.value, { regex: rx.input.checked, caseSensitive: mc.input.checked });
      if (r.error) { msg.error('That pattern is not valid: ' + r.error); return null; }
      if (!r.count) { msg.info('No matches.'); return null; }
      setTimeout(() => msg.info(`Replaced ${r.count} match${r.count === 1 ? '' : 'es'} — Undo puts them back.`));
      return r.text;
    });
    const sepVal = () => sep.value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    // Focus mode: the editor fills the screen with nothing else around it.
    let focusWrap = null;
    const home = h('div', { class: 'ty-scratch-home' }, ta);
    function focusMode(onOff) {
      if (onOff && !focusWrap) {
        focusWrap = h('div', { class: 'ty-focus' },
          h('div', { class: 'ty-focus-bar' }, counts.cloneNode(true), h('button', { class: 'btn small', type: 'button', onclick: () => focusMode(false) }, 'Done')));
        focusWrap.append(ta);
        document.body.append(focusWrap);
        document.body.classList.add('ty-focus-on');
        const live = focusWrap.querySelector('.ty-counts');
        ta.addEventListener('input', focusCount);
        function focusCount() { live.textContent = counts.textContent; }
        focusWrap.focusCount = focusCount;
        ta.focus();
      } else if (!onOff && focusWrap) {
        ta.removeEventListener('input', focusWrap.focusCount);
        home.append(ta);
        focusWrap.remove(); focusWrap = null;
        document.body.classList.remove('ty-focus-on');
      }
    }
    const escFocus = e => { if (e.key === 'Escape' && focusWrap) focusMode(false); };
    addEventListener('keydown', escFocus);

    const name = () => 'scratchpad';
    root.append(
      card(home, counts,
        row(h('button', { class: 'btn small', type: 'button', onclick: () => focusMode(true) }, 'Focus mode'), undoBtn,
          copyBtn(() => ta.value), downloadBtn(() => name() + '.txt', () => new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), '.txt'),
          downloadBtn(() => name() + '.md', () => new Blob([ta.value], { type: 'text/markdown;charset=utf-8' }), '.md'),
          sendBtn(() => ta.value ? { text: ta.value } : null)),
        msg.el),
      card(h('h3', {}, 'Lines'), h('div', { class: 'chips' },
        chip('Sort A–Z', T.sortAZ), chip('Sort Z–A', T.sortZA), chip('Natural sort', T.sortNatural), chip('Sort by length', T.sortLength),
        chip('Remove duplicates', t => T.dedupe(t)), chip('Trim spaces', T.trim), chip('Remove empty lines', T.removeEmpty),
        chip('Reverse', T.reverse), chip('Shuffle', T.shuffle), chip('Number lines', T.numberLines)),
        h('div', { class: 'row' }, field('Separator', sep, 'Use \\n for a new line'),
          h('button', { class: 'btn small', type: 'button', onclick: () => apply(t => T.join(t, sepVal()), 'Join lines') }, 'Join lines'),
          h('button', { class: 'btn small', type: 'button', onclick: () => apply(t => T.splitOn(t, sepVal()), 'Split') }, 'Split into lines')),
        h('div', { class: 'row' }, field('Columns', cols),
          h('button', { class: 'btn small', type: 'button', onclick: () => apply(t => T.wrap(t, parse(cols) || 72), 'Wrap') }, 'Wrap lines'))),
      card(h('h3', {}, 'Letters'), h('div', { class: 'chips' },
        chip('UPPER CASE', T.upper), chip('lower case', T.lower), chip('Title Case', T.title), chip('Sentence case', T.sentence),
        chip('Remove accents', T.removeAccents), chip('Smart quotes', T.smartQuotes), chip('Straight quotes', T.straightQuotes))),
      card(h('h3', {}, 'Find & replace'), grid(field('Find', find), field('Replace with', repl)),
        h('div', { class: 'row' }, h('div', { class: 'checks' }, rx, mc), h('button', { class: 'btn small primary', type: 'button', onclick: doReplace }, 'Replace all')),
        h('p', { class: 'field-hint' }, 'In regular-expression mode, $1 puts back the first group. Matching is per line for ^ and $.')));
    on(ta, changed);
    if (incoming) textOf(incoming).then(t => { if (t != null) { ta.value = t; changed(); } });
    return () => { focusMode(false); removeEventListener('keydown', escFocus); };
  },
};

// --- Document converter -----------------------------------------------------------------------------
const DOC_SAMPLE = `# Sample notes

Some **bold** and *italic* text with a [link](https://example.com).

- First item
- Second item

1. One
2. Two

> A quote.

| Name | Qty |
| --- | --- |
| Tea | 2 |`;
const FORMATS = [['md', 'Markdown'], ['html', 'HTML'], ['txt', 'Plain text'], ['docx', 'Word (.docx)']];
const LOSS = {
  'md>html': 'Everything Markdown can say has an HTML equivalent, so nothing is lost.',
  'html>md': 'Markdown has no colours, fonts, alignment, merged table cells or page layout — those are dropped. Tables need a plain header row to come through as tables.',
  'docx>html': 'Keeps headings (when the document uses Word’s Heading styles), bold, italic, lists, tables, links, footnotes and pictures (built into the HTML). Drops fonts, sizes, colours, alignment, page layout, headers and footers, text boxes, comments and tracked changes.',
  'docx>md': 'Keeps headings (Word Heading styles), bold, italic, lists, simple tables and links. Pictures, fonts, colours, alignment, page layout, headers, footers and comments are dropped.',
  'x>docx': 'Writes headings, paragraphs, bold, italic, strikethrough, inline code, links, bullet and numbered lists, quotes (indented), code blocks and simple tables. Pictures become a placeholder, and CSS colours and fonts are not carried over. Uses Word’s own Heading styles, so the result works with Word’s outline and contents.',
  'x>txt': 'Plain text keeps the words and line breaks only.',
  'txt>x': 'Plain text has no formatting: blank lines become paragraph breaks.',
};
const docConvert = {
  id: 'doc-convert', name: 'Document converter', group: 'type', icon: 'file-type',
  desc: 'Markdown, HTML, plain text and Word .docx — convert between them on your device.',
  keywords: 'document converter markdown html docx word txt convert turndown mammoth export import md to docx html to markdown',
  accepts: ['.md', '.markdown', '.html', '.htm', '.docx', '.txt', 'text', 'text/markdown', 'text/html', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  render(root, incoming) {
    const from = select(FORMATS, 'md'), to = select(FORMATS, 'html');
    const src = textarea({ rows: 12, value: DOC_SAMPLE });
    const srcField = field('Input', src);
    const drop = dropzone({ accept: '.md,.markdown,.html,.htm,.docx,.txt', label: 'Drop a .md, .html, .txt or .docx file, or tap to choose', onfiles: f => takeFile(f[0]) });
    const info = note();
    const loss = h('p', { class: 'field-hint ty-loss' });
    const out = output('Result', { multiline: true, rows: 12 });
    const frame = h('iframe', { class: 'md-frame ty-doc-frame', title: 'Preview' });
    frame.setAttribute('sandbox', '');
    const docxCard = h('div', { class: 'ty-docx-out' });
    let docxBuf = null, docxName = 'document.docx', baseName = 'document', result = null, timer = null;

    const ext = n => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    async function takeFile(file) {
      const e = ext(file.name);
      baseName = file.name.replace(/\.[^.]+$/, '') || 'document';
      const kind = e === 'docx' ? 'docx' : /^html?$/.test(e) ? 'html' : /^(md|markdown)$/.test(e) ? 'md' : 'txt';
      from.value = kind;
      if (kind === 'docx') { docxBuf = await file.arrayBuffer(); docxName = file.name; if (to.value === 'docx') to.value = 'html'; }
      else { docxBuf = null; src.value = await file.text(); if (to.value === kind) to.value = kind === 'md' ? 'html' : 'md'; }
      info.info(`${file.name} — ${fmtBytes(file.size)}`);
      run();
    }

    async function htmlFrom() {
      const f = from.value, D = await import('../lib/type-docs.js');
      if (f === 'md') return { html: await D.mdToHtml(src.value), D };
      if (f === 'html') return { html: src.value, D };
      if (f === 'txt') return { html: D.txtToHtml(src.value), D };
      if (!docxBuf) return { html: '', D };
      const r = await D.docxToHtml(docxBuf);
      return { html: r.html, warnings: r.warnings, D };
    }
    async function convert() {
      const f = from.value, t = to.value;
      srcField.hidden = f === 'docx';
      drop.querySelector('span').textContent = f === 'docx' && docxBuf ? `${docxName} — drop another file to replace it` : 'Drop a .md, .html, .txt or .docx file, or tap to choose';
      loss.textContent = t === 'docx' ? LOSS['x>docx'] : t === 'txt' ? LOSS['x>txt'] : f === 'txt' ? LOSS['txt>x'] : LOSS[`${f}>${t}`] || (f === t ? 'Same format in and out — nothing to convert.' : '');
      if (f === 'docx' && !docxBuf) { out.set(''); frame.srcdoc = ''; docxCard.replaceChildren(); info.info('Choose a .docx file above.'); return; }
      const { html, warnings, D } = await htmlFrom();
      if (warnings?.length) info.info('Word file notes: ' + [...new Set(warnings)].slice(0, 4).join(' · '));
      out.el.hidden = t === 'docx';
      frame.hidden = !(t === 'html' || (t === 'docx' && html));
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.55 system-ui,sans-serif;margin:16px;color:#222;background:#fff}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}pre{background:#f4f4f4;padding:8px;overflow:auto}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#555}</style>${html}`;
      docxCard.replaceChildren();
      if (t === 'md') result = f === 'md' ? src.value : await D.htmlToMd(html);
      else if (t === 'html') result = f === 'html' ? src.value : html;
      else if (t === 'txt') result = f === 'txt' ? src.value : D.htmlToTxt(html);
      else {
        const r = await D.htmlToDocx(html, baseName);
        result = new File([r.blob], baseName + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        docxCard.append(h('p', { class: 'big-say' }, `${result.name} is ready — ${fmtBytes(result.size)}`),
          r.dropped.length ? h('p', { class: 'field-hint' }, 'Left out: ' + r.dropped.join(', ') + '.') : null,
          row(downloadBtn(result.name, () => result, 'Download .docx'), sendBtn(() => result instanceof File ? { files: [result] } : null)));
        return;
      }
      out.set(result);
    }
    function run() {
      clearTimeout(timer);
      timer = setTimeout(() => convert().catch(e => info.error('Could not convert: ' + (e.message || e))), 250);
    }
    const extOf = { md: 'md', html: 'html', txt: 'txt' };
    const typeOf = { md: 'text/markdown', html: 'text/html', txt: 'text/plain' };
    root.append(
      card(grid(field('From', from), field('To', to)), drop, srcField, info.el),
      card(h('h3', {}, 'What survives'), loss),
      card(out.el,
        h('div', { class: 'row', hidden: false },
          downloadBtn(() => baseName + '.' + (extOf[to.value] || 'txt'), () => typeof result === 'string' ? new Blob([result], { type: typeOf[to.value] + ';charset=utf-8' }) : null, 'Download'),
          sendBtn(() => typeof result === 'string' && result ? { text: result } : null)),
        docxCard, frame));
    // The download/send row under the text result is hidden when the result is a .docx.
    const textRow = out.el.nextElementSibling;
    const syncRow = () => { textRow.hidden = to.value === 'docx'; };
    for (const el of [from, to]) el.addEventListener('change', () => { syncRow(); run(); });
    src.addEventListener('input', run);
    syncRow();
    if (incoming?.files?.[0]) takeFile(incoming.files[0]);
    else if (incoming) textOf(incoming).then(t => { if (t != null) { src.value = t; from.value = /^\s*</.test(t) ? 'html' : 'md'; to.value = from.value === 'html' ? 'md' : 'html'; syncRow(); run(); } });
    else run();
    return () => clearTimeout(timer);
  },
};

export default [largeType, glyphs, scratch, docConvert, fontExplorer, paper, lineHeight, pxRem, typeUnits];
