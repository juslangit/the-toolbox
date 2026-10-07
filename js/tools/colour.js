// The Colour drawer: an atlas page for one colour, contrast, harmonies, palettes
// (generate, browse, extract from a photo), a pixel picker, Tailwind scales,
// colour-blindness simulation and gradients. Maths lives in js/lib/colour-maths.js.
import { h, field, input, textarea, select, output, note, row, card, grid, tabs, on, copy, copyBtn, dropzone, downloadBtn, loadImage, rename, progress, toast } from '../ui.js';
import { sendBtn, sendTo, asFile } from '../hub.js';
import { icon } from '../icons.js';
import * as M from '../lib/colour-maths.js';
import { swatch, swatchRow, sendColourBtn, colourField, openIn } from '../lib/colour-ui.js';

const G = 'colour';
const WHITE = { r: 1, g: 1, b: 1, a: 1 }, BLACK = { r: 0, g: 0, b: 0, a: 1 };
const hex = c => M.toHex(c);
const OPEN = [['colour-atlas', 'Colour Atlas'], ['colour-contrast', 'Contrast checker'], ['colour-harmony', 'Harmonies'], ['colour-palette', 'Palette generator'],
  ['colour-tailwind', 'Tailwind shades'], ['colour-gradient', 'Gradient'], ['colour-blind', 'Colour-blind view']];
const openFrom = (here, getHex) => openIn(getHex, OPEN.filter(([id]) => id !== here));
const pill = (ok, text) => h('span', { class: 'cz-pill ' + (ok ? 'pass' : 'fail') }, (ok ? '✓ ' : '✗ ') + text);
const heading = t => h('h2', { class: 'cz-h' }, t);

function canvasPng(cv) { return new Promise(r => cv.toBlob(r, 'image/png')); }

// A little 2-colour pass/fail tile: colour as text on a background.
function contrastTile(fg, bg, label) {
  const r = M.contrast(fg, bg), lc = M.apca(fg, bg), w = M.wcag(r);
  return h('div', { class: 'cz-ctile', style: { background: hex(bg), color: hex(fg) } },
    h('div', { class: 'cz-ctile-say' }, h('strong', {}, 'Aa'), ' ', label),
    h('div', { class: 'cz-ctile-nums' }, h('b', {}, M.ratioText(r)), ` · APCA Lc ${Math.round(lc)}`),
    h('div', { class: 'cz-pills' }, pill(w.normalAA, 'AA'), pill(w.normalAAA, 'AAA'), pill(w.largeAA, 'AA large'), pill(w.ui, 'UI parts')));
}

// ============================================================================
// 1. Colour Atlas
// ============================================================================
const atlas = {
  id: 'colour-atlas', name: 'Colour Atlas', group: G, icon: 'palette', atlas: true,
  desc: 'Everything about one colour: every format, contrast, tints, harmonies and colour-blind views.',
  keywords: 'color colour info details hex rgb hsl hwb oklch lab cmyk name contrast apca tints shades complementary atlas',
  accepts: ['colour'],
  render(root, incoming) {
    let cur = M.parse(incoming?.colour || '#e8a33d');
    const err = note();
    const cf = colourField('Any CSS colour', hex(cur), c => { cur = c; draw(); });
    const hero = h('div', { class: 'cz-hero' });
    const fmts = ['HEX', 'RGB', 'HSL', 'HWB', 'HSV', 'OKLCH', 'OKLab', 'LAB', 'LCH', 'CMYK'];
    const outs = Object.fromEntries(fmts.map(n => [n, output(n)]));
    const nameOut = output('Nearest CSS name');
    const contrastBox = h('div', { class: 'grid2' });
    const bgSay = h('p', { class: 'field-hint' });
    const tintBox = h('div'), harmBox = h('div', { class: 'cz-stack' }), cvdBox = h('div'), twBox = h('div');
    cf.text.addEventListener('input', () => (cf.colour ? err.clear() : err.error('Not a colour I can read — try #e8a33d, rgb(232 163 61) or a name like teal.')));

    function draw() {
      if (!cur) return;
      const c = M.clip(cur), x = hex(c), nm = M.nearestName(c), [L, C, H] = M.toOklch(c);
      hero.style.background = x;
      hero.style.color = M.inkOn(c);
      hero.replaceChildren(
        h('div', { class: 'cz-hero-hex' }, x),
        h('div', { class: 'cz-hero-name' }, nm.exact ? nm.name : `close to ${nm.name}`),
        h('div', { class: 'cz-hero-meta' }, `Lightness ${Math.round(L * 100)}% · chroma ${M.round(C, 3)} · hue ${Math.round(H)}°`));
      const f = M.formats(cur);
      for (const n of fmts) outs[n].set(f[n]);
      nameOut.set(nm.exact ? nm.name : `${nm.name} (${nm.hex}, ΔE2000 ${nm.deltaE.toFixed(1)})`);
      contrastBox.replaceChildren(contrastTile(c, WHITE, 'on white'), contrastTile(c, BLACK, 'on black'));
      bgSay.textContent = `As a background, ${M.inkOn(c) === '#000000' ? 'black' : 'white'} text reads best (${M.ratioText(Math.max(M.contrast(c, WHITE), M.contrast(c, BLACK)))}).`;
      tintBox.replaceChildren(
        h('p', { class: 'field-label' }, 'Tints (mixed with white)'), swatchRow(M.tints(c, 5).reverse(), { tight: true }),
        h('p', { class: 'field-label' }, 'Shades (mixed with black)'), swatchRow(M.shades(c, 5), { tight: true }));
      harmBox.replaceChildren(...['complementary', 'analogous', 'triadic', 'split'].map(k =>
        h('div', {}, h('p', { class: 'field-label' }, M.HARMONIES[k].name), swatchRow(M.harmony(c, k), { tight: true }))));
      cvdBox.replaceChildren(swatchRow(['normal', ...Object.keys(M.CVD)].map(k => M.simulate(c, k)), { tight: true },
        ['As is', ...Object.values(M.CVD).map(v => v.name)]));
      const sc = M.tailwindScale(c);
      twBox.replaceChildren(swatchRow(sc.steps.map(s => s.colour), { tight: true }, sc.steps.map(s => String(s.step) + (s.step === sc.baseStep ? ' ●' : ''))));
    }
    root.append(
      card(cf.el, err.el, hero, h('div', { class: 'row' }, copyBtn(() => hex(cur), 'Copy HEX'), sendColourBtn(() => hex(cur)),
        h('button', { type: 'button', class: 'btn small', onclick: () => cf.set(M.fromOklch(0.45 + Math.random() * 0.4, 0.05 + Math.random() * 0.15, Math.random() * 360)) }, icon('dices', 16), ' Random'))),
      card(heading('Every format'), h('div', { class: 'cz-formats' }, fmts.map(n => outs[n].el), nameOut.el),
        h('p', { class: 'field-hint' }, 'CMYK here is the plain formula — real print colours depend on the printer’s profile.')),
      card(heading('Contrast'), contrastBox, bgSay),
      card(heading('Tints and shades'), tintBox),
      card(heading('Harmonies'), harmBox),
      card(heading('Colour-blind previews'), cvdBox, h('p', { class: 'field-hint' }, 'Machado et al. (2009) simulation. Tap any swatch to copy it.')),
      card(heading('Tailwind-style scale'), twBox),
      card(heading('Open in…'), openFrom('colour-atlas', () => hex(cur))));
    draw();
  },
};

// ============================================================================
// 2. Contrast checker
// ============================================================================
// Nearest colour (same hue and chroma, new lightness) that reaches the target ratio.
function nearestPassing(move, fixed, target) {
  const [L, C, H] = M.toOklch(move);
  let best = null;
  for (const dir of [-1, 1]) {
    for (let d = 0.002; d <= 1; d += 0.002) {
      const l = L + dir * d;
      if (l < 0 || l > 1) break;
      const c = M.fromOklch(l, C, H);
      if (M.contrast(c, fixed) >= target) { if (!best || d < best.d) best = { d, c }; break; }
    }
  }
  return best && best.c;
}

const contrastTool = {
  id: 'colour-contrast', name: 'Contrast checker', group: G, icon: 'contrast',
  desc: 'Is this text readable on that background? WCAG 2.2 and APCA, with a fix if it fails.',
  keywords: 'contrast ratio wcag aa aaa apca accessibility a11y readable text background',
  accepts: ['colour'],
  render(root, incoming) {
    const fg = colourField('Text colour', incoming?.colour || '#777777', run);
    const bg = colourField('Background', '#ffffff', run);
    const swap = h('button', { type: 'button', class: 'btn', title: 'Swap text and background', onclick: () => { const a = fg.text.value; fg.set(bg.text.value, false); bg.set(a, false); run(); } }, icon('arrow-left-right', 18), ' Swap');
    const preview = h('div', { class: 'cz-preview' });
    const ratio = h('div', { class: 'cz-ratio' });
    const table = h('table', { class: 'table cz-wcag' });
    const apcaOut = h('div', { class: 'kv' });
    const target = select([['4.5', 'AA normal text (4.5:1)'], ['7', 'AAA normal text (7:1)'], ['3', 'AA large text and UI parts (3:1)']], '4.5');
    const sugg = h('div', { class: 'cz-sugg' });
    function run() {
      const a = fg.colour, b = bg.colour;
      if (!a || !b) return;
      const r = M.contrast(a, b), w = M.wcag(r), lc = M.apca(a, b);
      preview.style.background = hex(b); preview.style.color = hex(a);
      preview.replaceChildren(h('div', { class: 'cz-prev-big' }, 'Large text, 24 px'),
        h('p', {}, 'Normal body text at 16 px. The quick brown fox jumps over the lazy dog, then reads the menu twice.'),
        h('p', { class: 'cz-prev-small' }, 'Small print at 13 px — fine print is where contrast fails first.'),
        h('span', { class: 'cz-prev-btn', style: { borderColor: hex(a) } }, 'A button outline'));
      ratio.replaceChildren(h('strong', {}, M.ratioText(r)), h('span', {}, r >= 7 ? 'Excellent' : r >= 4.5 ? 'Good for all text' : r >= 3 ? 'Large text only' : 'Too low'));
      ratio.dataset.level = r >= 4.5 ? 'good' : r >= 3 ? 'ok' : 'bad';
      table.replaceChildren(
        h('tr', {}, h('th', {}, 'What'), h('th', {}, 'AA'), h('th', {}, 'AAA')),
        h('tr', {}, h('th', {}, 'Normal text'), h('td', {}, pill(w.normalAA, '4.5')), h('td', {}, pill(w.normalAAA, '7'))),
        h('tr', {}, h('th', {}, 'Large text (24 px, or 19 px bold)'), h('td', {}, pill(w.largeAA, '3')), h('td', {}, pill(w.largeAAA, '4.5'))),
        h('tr', {}, h('th', {}, 'UI parts and graphics'), h('td', {}, pill(w.ui, '3')), h('td', {}, '—')));
      apcaOut.replaceChildren(h('dt', {}, 'APCA Lc'), h('dd', { class: 'cz-lc' }, String(M.round(lc, 1))), h('dt', {}, 'Means'), h('dd', {}, M.apcaSays(lc)));
      const t = +target.value;
      if (r >= t) { sugg.replaceChildren(h('p', { class: 'verdict good' }, '✓ Already passes this level.')); return; }
      const nf = nearestPassing(a, b, t), nb = nearestPassing(b, a, t);
      const opt = (c, what, apply) => c && h('div', { class: 'cz-sugg-item' }, swatch(c, { label: `${what} · ${M.ratioText(M.contrast(what === 'Text' ? c : a, what === 'Text' ? b : c))}` }),
        h('button', { type: 'button', class: 'btn small', onclick: apply }, `Use this ${what.toLowerCase()}`));
      sugg.replaceChildren(h('p', { class: 'field-hint' }, 'Closest colours that pass, keeping the same hue:'),
        h('div', { class: 'cz-row' }, opt(nf, 'Text', () => fg.set(hex(nf))), opt(nb, 'Background', () => bg.set(hex(nb)))) );
    }
    target.addEventListener('change', run);
    root.append(
      card(h('div', { class: 'cz-pair' }, fg.el, swap, bg.el), preview),
      h('div', { class: 'grid2' },
        card(ratio, table), card(heading('APCA (draft WCAG 3 method)'), apcaOut,
          h('p', { class: 'field-hint' }, 'Lc 90+ suits body text, 75 is the minimum for body text, 60 for other content, 45 for large headings. Negative means light text on dark.'))),
      card(heading('Suggest a passing colour'), field('Aim for', target), sugg,
        h('div', { class: 'row' }, sendColourBtn(() => hex(fg.colour)), h('span', { class: 'field-hint' }, 'sends the text colour'))));
    run();
  },
};

// ============================================================================
// 3. Harmony generator
// ============================================================================
function drawWheel(cv, space, base, list) {
  const S = cv.width, ctx = cv.getContext('2d'), R = S / 2, inner = R * 0.62;
  const ring = [];
  for (let d = 0; d < 360; d++) ring.push(space === 'hsl' ? M.fromHsl(d, 100, 50) : M.fromOklch(0.72, Math.min(0.14, M.maxChroma(0.72, d)), d));
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - R + 0.5, dy = y - R + 0.5, r = Math.hypot(dx, dy), i = (y * S + x) * 4;
    if (r > R - 1 || r < inner) continue;
    const hue = ((Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360 + 360) % 360;
    const c = ring[Math.floor(hue) % 360];
    img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.beginPath(); ctx.arc(R, R, inner * 0.82, 0, Math.PI * 2); ctx.fillStyle = hex(base); ctx.fill();
  const hueOf = c => (space === 'hsl' ? M.toHsl(c)[0] : M.toOklch(c)[2]);
  const pts = list.map(c => { const a = (hueOf(c) - 90) * Math.PI / 180, rr = (R + inner) / 2; return [R + Math.cos(a) * rr, R + Math.sin(a) * rr, c]; });
  ctx.lineWidth = S / 160; ctx.strokeStyle = 'rgba(255,255,255,.85)';
  if (pts.length > 1) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (pts.length > 2) ctx.closePath(); ctx.stroke(); }
  for (const [x, y, c] of pts) {
    ctx.beginPath(); ctx.arc(x, y, S / 22, 0, Math.PI * 2); ctx.fillStyle = hex(c); ctx.fill();
    ctx.lineWidth = S / 90; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.lineWidth = S / 240; ctx.strokeStyle = '#000'; ctx.stroke();
  }
}

const harmonyTool = {
  id: 'colour-harmony', name: 'Harmony generator', group: G, icon: 'rainbow',
  desc: 'Complementary, triadic, analogous and more — shown on a colour wheel.',
  keywords: 'harmony color wheel complementary split analogous triadic tetradic square monochrome scheme',
  accepts: ['colour'],
  render(root, incoming) {
    const cf = colourField('Base colour', incoming?.colour || '#e8a33d', run);
    const kind = tabs(Object.entries(M.HARMONIES).map(([k, v]) => [k, v.name]), 'complementary', run);
    const space = select([['oklch', 'Perceptual wheel (OKLCH)'], ['hsl', 'Classic wheel (HSL)']], 'oklch');
    const cv = h('canvas', { class: 'cz-wheel', width: 640, height: 640, 'aria-label': 'Colour wheel — tap to change the hue' });
    const out = h('div');
    const css = output('CSS variables', { multiline: true, rows: 5 });
    let list = [];
    function run() {
      const c = cf.colour; if (!c) return;
      list = M.harmony(c, kind.value, space.value);
      drawWheel(cv, space.value, c, kind.value === 'monochrome' ? [c] : list);
      out.replaceChildren(swatchRow(list, {}));
      css.set(`:root {\n${list.map((x, i) => `  --harmony-${i + 1}: ${hex(x)};`).join('\n')}\n}`);
    }
    space.addEventListener('change', run);
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      const hue = ((Math.atan2(dy, dx) * 180 / Math.PI + 90) % 360 + 360) % 360, c = cf.colour;
      if (space.value === 'hsl') { const [, s, l] = M.toHsl(c); cf.set(M.fromHsl(hue, Math.max(s, 40), l)); }
      else { const [L, C] = M.toOklch(c); cf.set(M.fromOklch(L, Math.max(C, 0.08), hue)); }
    });
    root.append(
      h('div', { class: 'grid2' },
        card(cf.el, field('Wheel', space), kind, out),
        h('section', { class: 'card center' }, cv, h('p', { class: 'field-hint' }, 'Tap the ring to turn the base colour.'))),
      card(css.el, openFrom('colour-harmony', () => hex(cf.colour))));
    run();
  },
};

// ============================================================================
// 4. Palette generator
// ============================================================================
const STYLES = {
  balanced: { name: 'Balanced', hues: [0, 25, 50, 180, 205], L: [0.35, 0.92], C: [0.06, 0.16] },
  analogous: { name: 'Analogous', hues: [-40, -20, 0, 20, 40], L: [0.3, 0.92], C: [0.07, 0.17] },
  contrast: { name: 'Contrasting', hues: [0, 0, 180, 180, 15], L: [0.3, 0.9], C: [0.08, 0.2] },
  triad: { name: 'Triad', hues: [0, 120, 240, 10, 130], L: [0.35, 0.88], C: [0.08, 0.18] },
  pastel: { name: 'Pastel', hues: [0, 60, 130, 200, 280], L: [0.86, 0.95], C: [0.04, 0.09] },
  muted: { name: 'Muted', hues: [0, 30, 60, 190, 220], L: [0.35, 0.85], C: [0.02, 0.07] },
  vivid: { name: 'Vivid', hues: [0, 50, 140, 220, 300], L: [0.55, 0.8], C: [0.18, 0.3] },
  dark: { name: 'Dark UI', hues: [0, 0, 10, 180, 40], L: [0.14, 0.45], C: [0.01, 0.08] },
  mono: { name: 'One hue', hues: [0, 0, 0, 0, 0], L: [0.22, 0.95], C: [0.04, 0.16] },
};
function generate(n, style, locked, rand = Math.random) {
  const s = STYLES[style];
  const anchor = locked.find(Boolean);
  const h0 = anchor ? M.toOklch(anchor)[2] - s.hues[locked.indexOf(anchor) % s.hues.length] : rand() * 360;
  const Ls = Array.from({ length: n }, (_, i) => s.L[1] - (s.L[1] - s.L[0]) * (n === 1 ? 0.5 : i / (n - 1)));
  // Shuffle lightness a little so palettes are not always light→dark.
  if (rand() < 0.5) Ls.reverse();
  return Array.from({ length: n }, (_, i) => {
    if (locked[i]) return locked[i];
    const hue = h0 + s.hues[i % s.hues.length] + (rand() - 0.5) * 24;
    const l = M.clamp(Ls[i] + (rand() - 0.5) * 0.06, 0.08, 0.98);
    const c = s.C[0] + rand() * (s.C[1] - s.C[0]);
    return M.fromOklch(l, Math.min(c, M.maxChroma(l, hue) * 0.95), hue);
  });
}
function palettePng(cols, w = 1200, ht = 400) {
  const cv = h('canvas', { width: w, height: ht }), ctx = cv.getContext('2d');
  const bw = w / cols.length;
  cols.forEach((c, i) => {
    ctx.fillStyle = hex(c); ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, ht);
    ctx.fillStyle = M.inkOn(c); ctx.font = `600 ${Math.round(ht / 14)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText(hex(c).toUpperCase(), i * bw + bw / 2, ht - ht / 10);
  });
  return cv;
}
const exportsOf = (cols, name = 'palette') => ({
  css: `:root {\n${cols.map((c, i) => `  --${name}-${i + 1}: ${hex(c)};`).join('\n')}\n}`,
  tailwind: `// tailwind.config.js → theme.extend.colors\n${JSON.stringify({ [name]: Object.fromEntries(cols.map((c, i) => [String((i + 1) * 100), hex(c)])) }, null, 2)}`,
  json: JSON.stringify(cols.map(c => hex(c)), null, 2),
});

const paletteGen = {
  id: 'colour-palette', name: 'Palette generator', group: G, icon: 'swatch-book',
  desc: 'Make a good-looking palette in one tap. Lock the colours you like and roll the rest.',
  keywords: 'palette generator scheme random colors coolors lock space export css tailwind json png',
  accepts: ['colour'],
  render(root, incoming) {
    let n = 5, cols = [], locked = [];
    if (incoming?.palette?.length) { cols = incoming.palette.map(M.parse).filter(Boolean); n = cols.length; locked = cols.map(() => null); }
    else if (incoming?.colour) { locked = [M.parse(incoming.colour)]; }
    const count = select([3, 4, 5, 6, 7, 8].map(String), String(n));
    const style = select(Object.entries(STYLES).map(([k, v]) => [k, v.name]), 'balanced');
    const strip = h('div', { class: 'cz-gen' });
    const fmt = tabs([['css', 'CSS variables'], ['tailwind', 'Tailwind'], ['json', 'JSON']], 'css', showExport);
    const exp = output('Export', { multiline: true, rows: 8 });
    const roll = h('button', { type: 'button', class: 'btn primary', onclick: () => regen() }, icon('refresh-cw', 18), ' New palette');
    function regen() {
      n = +count.value;
      const lk = Array.from({ length: n }, (_, i) => locked[i] || null);
      cols = generate(n, style.value, lk);
      locked = lk;
      draw();
    }
    function draw() {
      strip.replaceChildren(...cols.map((c, i) => {
        const x = hex(c), isLocked = !!locked[i];
        const pick = h('input', { type: 'color', value: x, class: 'cz-gen-pick', 'aria-label': `Change colour ${i + 1}` });
        pick.addEventListener('input', () => { cols[i] = M.parse(pick.value); locked[i] = cols[i]; draw(); });
        return h('div', { class: 'cz-gen-col' + (isLocked ? ' locked' : ''), style: { background: x, color: M.inkOn(c) } },
          h('button', { type: 'button', class: 'cz-gen-hex', title: 'Copy', onclick: () => copy(x) }, x.toUpperCase()),
          h('div', { class: 'cz-gen-tools' },
            h('button', { type: 'button', class: 'cz-gen-btn', 'aria-pressed': String(isLocked), title: isLocked ? 'Unlock' : 'Lock — keep this colour when rolling',
              onclick: () => { locked[i] = locked[i] ? null : cols[i]; draw(); } }, icon('lock', 16), isLocked ? ' Locked' : ' Lock'),
            h('label', { class: 'cz-gen-btn', title: 'Change this colour' }, icon('pipette', 16), pick),
            sendColourBtn(x)));
      }));
      showExport();
    }
    function showExport() { if (cols.length) exp.set(exportsOf(cols)[fmt.value]); }
    count.addEventListener('change', () => { locked = locked.slice(0, +count.value); regen(); });
    style.addEventListener('change', regen);
    const onKey = e => {
      if (e.code !== 'Space' || e.repeat || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName)) return;
      e.preventDefault(); regen();
    };
    addEventListener('keydown', onKey);
    root.append(
      card(h('div', { class: 'row' }, field('Colours', count), field('Style', style), roll),
        h('p', { class: 'field-hint cz-desktop' }, 'Tip: press the space bar for a new palette.'), strip),
      card(fmt, exp.el, h('div', { class: 'row' },
        downloadBtn('palette.png', () => canvasPng(palettePng(cols)), 'Download PNG'),
        copyBtn(() => cols.map(hex).join(' '), 'Copy hex list'))));
    if (cols.length) draw(); else regen();
    return () => removeEventListener('keydown', onKey);
  },
};

// ============================================================================
// 5. Palette collection
// ============================================================================
const collection = {
  id: 'colour-collection', name: 'Palette collection', group: G, icon: 'library',
  desc: 'Forty hand-made palettes to browse, search, copy and build on.',
  keywords: 'palette collection library inspiration swatches presets browse',
  accepts: ['colour'],
  render(root, incoming) {
    const q = input({ placeholder: 'Search: warm, blue, pastel, dark…' });
    const list = h('div', { class: 'cz-coll' });
    const count = h('p', { class: 'field-hint' });
    const near = incoming?.colour ? M.parse(incoming.colour) : null;
    let PALETTES = [];
    function show() {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      let items = PALETTES.filter(p => words.every(w => (p.name + ' ' + p.tags + ' ' + p.colours.join(' ')).toLowerCase().includes(w)));
      if (near) items = items.map(p => ({ p, d: Math.min(...p.colours.map(c => M.deltaE2000(near, M.parse(c)))) })).sort((a, b) => a.d - b.d).map(x => x.p);
      count.textContent = `${items.length} of ${PALETTES.length} palettes` + (near ? ` · closest to ${hex(near)} first` : '');
      list.replaceChildren(...items.map(p => {
        let chosen = p.colours[0];
        const sel = h('span', { class: 'cz-coll-sel' }, chosen);
        return h('article', { class: 'cz-coll-item' },
          h('div', { class: 'cz-coll-strip' }, p.colours.map(c => h('button', {
            type: 'button', style: { background: c }, title: `Copy ${c}`, 'aria-label': `Copy ${c}`,
            onclick: () => { copy(c); chosen = c; sel.textContent = c; },
          }))),
          h('div', { class: 'cz-coll-head' }, h('strong', {}, p.name), sel),
          h('div', { class: 'row tight cz-coll-actions' },
            copyBtn(() => exportsOf(p.colours.map(M.parse), p.name.toLowerCase().replace(/\W+/g, '-')).css, 'CSS'),
            copyBtn(() => p.colours.join(' '), 'Hex'),
            h('button', { type: 'button', class: 'btn small', onclick: () => sendTo('colour-palette', { colour: p.colours[0], palette: p.colours }) }, 'Edit'),
            sendColourBtn(() => chosen)));
      }));
    }
    root.append(card(field('Find a palette', q), count), list);
    import('../lib/colour-palettes.js').then(m => { PALETTES = m.PALETTES; on(q, show); });
  },
};

// ============================================================================
// 6. Palette extractor
// ============================================================================
const extractor = {
  id: 'colour-extract', name: 'Palette from image', group: G, icon: 'image',
  desc: 'Pull the main colours out of a photo, with how much of the picture each one covers.',
  keywords: 'extract palette image photo dominant colors kmeans median cut picture',
  accepts: ['image/*'],
  render(root, incoming) {
    const k = select(['3', '4', '5', '6', '7', '8', '10', '12'], '6');
    const prev = h('div', { class: 'preview' });
    const bar = h('div', { class: 'cz-bar' });
    const out = h('div', { class: 'cz-extract' });
    const prog = progress();
    const msg = note();
    const exp = output('CSS variables', { multiline: true, rows: 6 });
    let pixels = null, result = [], token = 0, fileName = 'image';
    async function load(file) {
      fileName = file.name || 'image';
      try {
        const img = await loadImage(file);
        const max = 256, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = h('canvas', { width: Math.max(1, Math.round(img.naturalWidth * s)), height: Math.max(1, Math.round(img.naturalHeight * s)) });
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        pixels = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const shown = h('img', { src: URL.createObjectURL(file), alt: 'Your image' });
        shown.onload = () => URL.revokeObjectURL(shown.src);
        prev.replaceChildren(shown);
        msg.clear();
        run();
      } catch { msg.error('Could not open that image.'); }
    }
    async function run() {
      if (!pixels) return;
      const my = ++token;
      prog.set(0); prog.label('Finding colours…');
      const { extract } = await import('../lib/colour-extract.js');
      const res = await extract(pixels, +k.value, { onprogress: p => my === token && prog.set(p) });
      if (my !== token) return;
      prog.hide();
      result = res;
      bar.replaceChildren(...res.map(x => h('span', { style: { background: hex(x.colour), flexGrow: x.share }, title: `${hex(x.colour)} · ${Math.round(x.share * 100)}%` })));
      out.replaceChildren(swatchRow(res.map(x => x.colour), {}, res.map(x => `${(x.share * 100).toFixed(1)}%`)));
      if (res.length < +k.value) msg.info(`This picture only has ${res.length} distinct colour${res.length === 1 ? '' : 's'}.`);
      exp.set(exportsOf(res.map(x => x.colour)).css);
    }
    k.addEventListener('change', run);
    root.append(
      card(dropzone({ accept: 'image/*', label: 'Drop a photo here, or tap to choose one', onfiles: f => load(f[0]) }), field('How many colours', k), prog.el, msg.el),
      h('div', { class: 'grid2' }, card(prev), card(heading('Palette'), bar, out)),
      card(exp.el, h('div', { class: 'row' },
        downloadBtn(() => rename(fileName, 'png', '-palette'), () => result.length && canvasPng(palettePng(result.map(x => x.colour))), 'Download PNG'),
        h('button', { type: 'button', class: 'btn small', onclick: () => result.length && sendTo('colour-palette', { colour: hex(result[0].colour), palette: result.slice(0, 8).map(x => hex(x.colour)) }) }, 'Open in palette generator')),
        h('p', { class: 'field-hint' }, 'Uses k-means clustering in OKLab on a 256-pixel copy, so it is quick and works offline. Tiny details may not get their own colour.')));
    if (incoming?.files?.[0]) load(incoming.files[0]);
  },
};

// ============================================================================
// 7. Pixel picker
// ============================================================================
const picker = {
  id: 'colour-picker', name: 'Pixel picker', group: G, icon: 'pipette',
  desc: 'Tap anywhere on a picture to read its colour, with a zoom loupe.',
  keywords: 'eyedropper picker pick color from image pixel sample loupe zoom',
  accepts: ['image/*'],
  render(root, incoming) {
    const cv = h('canvas', { class: 'cz-pick-canvas' });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const loupe = h('canvas', { class: 'cz-loupe', width: 150, height: 150, hidden: true });
    const lctx = loupe.getContext('2d');
    const wrap = h('div', { class: 'cz-pick-wrap', hidden: true }, cv, loupe);
    const size = select([['1', 'Single pixel'], ['3', '3 × 3 average'], ['5', '5 × 5 average']], '1');
    const now = h('div', { class: 'cz-now' });
    const picked = [];
    const list = h('div', { class: 'cz-picked' });
    const drawList = () => list.replaceChildren(...(picked.length ? picked.map((c, i) => h('div', { class: 'cz-picked-item' }, swatch(c, {}),
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Remove', onclick: () => { picked.splice(i, 1); drawList(); } }, icon('x', 16))))
      : [h('p', { class: 'field-hint' }, 'Nothing picked yet — tap the picture.')]));
    function at(e) {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * cv.width), y = Math.floor((e.clientY - r.top) / r.height * cv.height);
      return x >= 0 && y >= 0 && x < cv.width && y < cv.height ? [x, y] : null;
    }
    function sample(x, y) {
      const s = +size.value, half = (s - 1) / 2;
      const x0 = Math.max(0, x - half), y0 = Math.max(0, y - half), w = Math.min(cv.width, x + half + 1) - x0, ht = Math.min(cv.height, y + half + 1) - y0;
      const d = ctx.getImageData(x0, y0, w, ht).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return { r: r / n / 255, g: g / n / 255, b: b / n / 255, a: 1 };
    }
    function showLoupe(e, p) {
      const [x, y] = p, N = 15, cell = loupe.width / N;
      lctx.imageSmoothingEnabled = false;
      lctx.clearRect(0, 0, loupe.width, loupe.height);
      lctx.fillStyle = '#000'; lctx.fillRect(0, 0, loupe.width, loupe.height);
      lctx.drawImage(cv, x - 7, y - 7, N, N, 0, 0, loupe.width, loupe.height);
      lctx.strokeStyle = '#fff'; lctx.lineWidth = 2; lctx.strokeRect(7 * cell, 7 * cell, cell, cell);
      lctx.strokeStyle = '#000'; lctx.lineWidth = 1; lctx.strokeRect(7 * cell - 1.5, 7 * cell - 1.5, cell + 3, cell + 3);
      const wr = wrap.getBoundingClientRect(), touch = e.pointerType === 'touch';
      let lx = e.clientX - wr.left + 20, ly = e.clientY - wr.top + (touch ? -190 : 20);
      if (lx + 150 > wr.width) lx = e.clientX - wr.left - 170;
      if (ly < 0) ly = e.clientY - wr.top + 30;
      loupe.style.left = Math.max(0, lx) + 'px'; loupe.style.top = ly + 'px';
      loupe.hidden = false;
      const c = sample(x, y);
      now.replaceChildren(h('span', { class: 'cz-now-dot', style: { background: hex(c) } }), h('code', {}, hex(c)), h('span', { class: 'field-hint' }, ` at ${x}, ${y}`));
    }
    cv.addEventListener('pointermove', e => { const p = at(e); if (p) showLoupe(e, p); else loupe.hidden = true; });
    cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { cv.setPointerCapture?.(e.pointerId); } const p = at(e); if (p) showLoupe(e, p); });
    cv.addEventListener('pointerup', e => {
      const p = at(e); loupe.hidden = e.pointerType !== 'mouse';
      if (!p) return;
      picked.unshift(sample(...p)); drawList();
    });
    cv.addEventListener('pointerleave', () => { loupe.hidden = true; });
    async function load(file) {
      try {
        const img = await loadImage(file);
        const s = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
        cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        wrap.hidden = false;
      } catch { toast('Could not open that image'); }
    }
    const eye = 'EyeDropper' in window && h('button', { type: 'button', class: 'btn', onclick: async () => {
      try { const r = await new window.EyeDropper().open(); picked.unshift(M.parse(r.sRGBHex)); drawList(); } catch { /* cancelled */ }
    } }, icon('crosshair', 18), ' Pick from screen');
    root.append(
      card(dropzone({ accept: 'image/*', label: 'Drop a picture here, or tap to choose one', onfiles: f => load(f[0]) }),
        h('div', { class: 'row' }, field('Sample', size), eye), now, wrap,
        h('p', { class: 'field-hint' }, 'Hover or drag to aim, tap or click to keep the colour.')),
      card(heading('Picked colours'), list, h('div', { class: 'row' }, copyBtn(() => picked.map(hex).join('\n'), 'Copy all'),
        h('button', { type: 'button', class: 'btn small', onclick: () => picked.length && sendTo('colour-palette', { colour: hex(picked[0]), palette: picked.slice(0, 8).map(hex) }) }, 'Make a palette'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { picked.length = 0; drawList(); } }, 'Clear'))));
    drawList();
    if (incoming?.files?.[0]) load(incoming.files[0]);
  },
};

// ============================================================================
// 8. Tailwind shades
// ============================================================================
const tailwind = {
  id: 'colour-tailwind', name: 'Tailwind shades', group: G, icon: 'layers',
  desc: 'A full 50–950 shade scale from one colour, ready for Tailwind v4 or v3.',
  keywords: 'tailwind shades scale 50 950 theme oklch css variables design tokens ramp',
  accepts: ['colour'],
  render(root, incoming) {
    const cf = colourField('Base colour', incoming?.colour || '#3b82f6', run);
    const name = input({ value: 'brand', mono: true });
    const pin = select([['auto', 'Auto'], ...M.STEPS.map(s => [String(s), String(s)])], 'auto');
    const scale = h('div', { class: 'cz-scale' });
    const v4 = output('Tailwind v4 — @theme (CSS)', { multiline: true, rows: 8 });
    const v3 = output('Tailwind v3 — theme.extend.colors (JSON)', { multiline: true, rows: 8 });
    function run() {
      const c = cf.colour; if (!c) return;
      const nm = (name.value.trim() || 'brand').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const { steps, baseStep } = M.tailwindScale(c, pin.value);
      scale.replaceChildren(...steps.map(s => h('div', { class: 'cz-scale-row' + (s.step === baseStep ? ' base' : '') },
        h('span', { class: 'cz-scale-step' }, String(s.step)),
        swatch(s.colour, { send: false }),
        h('code', {}, M.oklchCss(s.L, s.C, s.H)),
        h('span', { class: 'cz-scale-c' }, `${M.ratioText(M.contrast(s.colour, WHITE))} on white`),
        sendColourBtn(hex(s.colour)))));
      v4.set(`@theme {\n${steps.map(s => `  --color-${nm}-${s.step}: ${M.oklchCss(s.L, s.C, s.H)};`).join('\n')}\n}`);
      v3.set(JSON.stringify({ [nm]: Object.fromEntries(steps.map(s => [String(s.step), hex(s.colour)])) }, null, 2));
    }
    on([name, pin], run); pin.addEventListener('change', run);
    root.append(card(h('div', { class: 'row' }, cf.el, field('Name', name), field('Your colour sits at', pin)), scale,
      h('p', { class: 'field-hint' }, 'Lightness steps follow Tailwind’s own palette; chroma eases off towards white and black so the ends stay clean. ● marks your colour, kept exactly.')),
    h('div', { class: 'grid2' }, card(v4.el), card(v3.el)));
  },
};

// ============================================================================
// 9. Colour-blindness simulator
// ============================================================================
const LIN8 = Float32Array.from({ length: 256 }, (_, i) => M.toLinear(i / 255));
const GAM = Uint8ClampedArray.from({ length: 4096 }, (_, i) => Math.round(M.toGamma(i / 4095) * 255));
function simulateImage(src, kind) {
  const out = new ImageData(src.width, src.height), d = src.data, o = out.data;
  const m = kind === 'normal' ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : M.CVD[kind].m;
  const g = v => GAM[v <= 0 ? 0 : v >= 1 ? 4095 : Math.round(v * 4095)];
  for (let i = 0; i < d.length; i += 4) {
    const r = LIN8[d[i]], gg = LIN8[d[i + 1]], b = LIN8[d[i + 2]];
    o[i] = g(m[0][0] * r + m[0][1] * gg + m[0][2] * b);
    o[i + 1] = g(m[1][0] * r + m[1][1] * gg + m[1][2] * b);
    o[i + 2] = g(m[2][0] * r + m[2][1] * gg + m[2][2] * b);
    o[i + 3] = d[i + 3];
  }
  return out;
}
const cvdTool = {
  id: 'colour-blind', name: 'Colour-blindness simulator', group: G, icon: 'glasses',
  desc: 'See a picture or a palette the way people with colour-vision deficiency see it.',
  keywords: 'color blind colour blindness cvd protanopia deuteranopia tritanopia achromatopsia simulate accessibility daltonism',
  accepts: ['image/*', 'colour'],
  render(root, incoming) {
    const kind = select(Object.entries(M.CVD).map(([k, v]) => [k, `${v.name} — ${v.note}`]), 'deuteranopia');
    const orig = h('canvas', { class: 'cz-cvd-canvas' }), sim = h('canvas', { class: 'cz-cvd-canvas', 'data-sim': '1' });
    const pair = h('div', { class: 'cz-cvd-pair', hidden: true },
      h('figure', {}, orig, h('figcaption', {}, 'As it is')), h('figure', {}, sim, h('figcaption', { class: 'cz-cvd-cap' })));
    const actions = h('div', { class: 'row', hidden: true },
      downloadBtn(() => rename(fileName, 'png', '-' + kind.value), () => canvasPng(sim), 'Download PNG'),
      sendBtn(async () => ({ files: [await asFile(sim, rename(fileName, 'png', '-' + kind.value))] })));
    let src = null, fileName = 'image.png';
    const pal = textarea({ rows: 3, value: incoming?.colour ? `${incoming.colour} #e8a33d #2f8a43 #c4432c` : '#e8a33d #2f8a43 #c4432c #3f6fbf #7a3ea8' });
    const table = h('div', { class: 'cz-cvd-table' });
    function runImage() {
      if (!src) return;
      sim.width = src.width; sim.height = src.height;
      sim.getContext('2d').putImageData(simulateImage(src, kind.value), 0, 0);
      pair.querySelector('.cz-cvd-cap').textContent = M.CVD[kind.value].name;
    }
    function runPalette() {
      const cols = pal.value.split(/[\s,;]+(?![^(]*\))/).map(M.parse).filter(Boolean);
      table.replaceChildren(...[['normal', 'As is'], ...Object.entries(M.CVD).map(([k, v]) => [k, v.name])].map(([k, label]) =>
        h('div', { class: 'cz-cvd-row', 'data-kind': k }, h('span', { class: 'cz-cvd-label' }, label),
          h('div', { class: 'cz-cvd-strip' }, cols.map(c => { const s = M.simulate(c, k), x = hex(s); return h('button', { type: 'button', style: { background: x }, title: `Copy ${x}`, 'data-hex': x, onclick: () => copy(x) }); })))));
    }
    async function load(file) {
      fileName = file.name || 'image.png';
      try {
        const img = await loadImage(file);
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        orig.width = Math.round(img.naturalWidth * s); orig.height = Math.round(img.naturalHeight * s);
        const ctx = orig.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, orig.width, orig.height);
        src = ctx.getImageData(0, 0, orig.width, orig.height);
        pair.hidden = false; actions.hidden = false;
        runImage();
      } catch { toast('Could not open that image'); }
    }
    kind.addEventListener('change', runImage);
    on(pal, runPalette);
    root.append(
      card(heading('Picture'), dropzone({ accept: 'image/*', label: 'Drop a picture or screenshot here, or tap to choose one', onfiles: f => load(f[0]) }),
        field('Type of colour vision', kind), pair, actions),
      card(heading('Palette'), field('Colours (any CSS format, separated by spaces or lines)', pal), table),
      card(h('p', { class: 'field-hint' }, 'Method: Machado, Oliveira & Fernandes (2009) matrices applied in linear RGB — full strength for the “-opia” types, 60% strength for the “-anomaly” types. Achromatopsia uses plain luminance. People vary, so treat this as a good guide, not a diagnosis.')));
    if (incoming?.files?.[0]) load(incoming.files[0]);
  },
};

// ============================================================================
// 10. Gradient generator
// ============================================================================
const CORNERS = { tl: ['top left', 0, 0], tr: ['top right', 1, 0], bl: ['bottom left', 0, 1], br: ['bottom right', 1, 1] };
const MESH_AT = [[0, 0], [1, 1], [1, 0], [0, 1], [0.5, 0.5], [0.5, 0], [0, 0.5]];
const supportsIn = typeof CSS !== 'undefined' && CSS.supports('background-image', 'linear-gradient(in oklch, red, blue)');

function gradientCss(o) {
  const stops = [...o.stops].sort((a, b) => a.pos - b.pos);
  const list = stops.map(s => `${hex(s.c)} ${s.pos}%`).join(', ');
  // Baked fallback: extra stops computed here, so even old browsers show the same blend.
  const baked = [];
  for (let i = 0; i < stops.length; i++) {
    baked.push(`${hex(stops[i].c)} ${stops[i].pos}%`);
    if (i < stops.length - 1 && o.space !== 'srgb') for (let k = 1; k < 8; k++) {
      const t = k / 8, p = stops[i].pos + (stops[i + 1].pos - stops[i].pos) * t;
      baked.push(`${hex(M.mix[o.space](stops[i].c, stops[i + 1].c, t))} ${M.round(p, 1)}%`);
    }
  }
  const inSp = o.space === 'srgb' ? '' : `in ${o.space}`;
  const head = { linear: `${o.angle}deg`, radial: `circle at ${o.cx}% ${o.cy}%`, conic: `from ${o.angle}deg at ${o.cx}% ${o.cy}%`, corner: `circle farthest-corner at ${CORNERS[o.corner][0]}` }[o.type];
  const fn = { linear: 'linear-gradient', radial: 'radial-gradient', conic: 'conic-gradient', corner: 'radial-gradient' }[o.type];
  if (o.type === 'mesh') {
    const layers = stops.slice(1).map((s, i) => { const [x, y] = MESH_AT[i % MESH_AT.length]; return `radial-gradient(at ${x * 100}% ${y * 100}%, ${hex(s.c)} 0px, transparent ${o.spread}%)`; });
    const css = `background-color: ${hex(stops[0].c)};\nbackground-image:\n  ${layers.join(',\n  ')};`;
    return { css, preview: { backgroundColor: hex(stops[0].c), backgroundImage: layers.join(', ') } };
  }
  const fallback = `${fn}(${head}, ${(o.space === 'srgb' ? list : baked.join(', '))})`;
  const modern = `${fn}(${inSp ? inSp + ' ' : ''}${head}, ${list})`;
  const css = o.space === 'srgb' ? `background: ${fallback};` : `background: ${fallback};\nbackground: ${modern};`;
  return { css, fallback, modern, preview: { background: supportsIn && o.space !== 'srgb' ? modern : fallback } };
}

// Pixel-exact render for the PNG (our own interpolation, so OKLCH works everywhere).
function renderGradient(o, W, H) {
  const cv = h('canvas', { width: W, height: H }), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const stops = [...o.stops].sort((a, b) => a.pos - b.pos);
  if (o.type === 'mesh') {
    const pts = stops.map((s, i) => ({ lab: M.toOklab(s.c), at: i === 0 ? null : MESH_AT[(i - 1) % MESH_AT.length] }));
    const R = o.spread / 100;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / (W - 1 || 1), v = y / (H - 1 || 1);
      let L = pts[0].lab[0], A = pts[0].lab[1], B = pts[0].lab[2];
      for (const p of pts.slice(1)) { // same idea as the CSS: each point fades out over `spread`
        const dist = Math.hypot(u - p.at[0], (v - p.at[1]) * H / W) / R;
        const w = Math.max(0, 1 - dist); const ww = w * w * (3 - 2 * w);
        L += (p.lab[0] - L) * ww; A += (p.lab[1] - A) * ww; B += (p.lab[2] - B) * ww;
      }
      const c = M.fromOklab(L, A, B), i = (y * W + x) * 4;
      d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return cv;
  }
  const N = 1024, lut = new Uint8ClampedArray(N * 4);
  for (let k = 0; k < N; k++) {
    const p = k / (N - 1) * 100;
    let c;
    if (p <= stops[0].pos) c = stops[0].c; else if (p >= stops.at(-1).pos) c = stops.at(-1).c;
    else { const j = stops.findIndex(s => s.pos >= p); const a = stops[j - 1], b = stops[j]; c = M.mix[o.space](a.c, b.c, (p - a.pos) / (b.pos - a.pos || 1)); }
    c = M.clip(c); lut[k * 4] = c.r * 255; lut[k * 4 + 1] = c.g * 255; lut[k * 4 + 2] = c.b * 255; lut[k * 4 + 3] = (c.a ?? 1) * 255;
  }
  const ang = o.angle * Math.PI / 180, sx = Math.sin(ang), sy = -Math.cos(ang);
  const half = (Math.abs(W * sx) + Math.abs(H * sy)) / 2; // CSS gradient-line length / 2
  let cx = o.cx / 100 * W, cy = o.cy / 100 * H, far;
  if (o.type === 'corner') { cx = CORNERS[o.corner][1] * W; cy = CORNERS[o.corner][2] * H; }
  if (o.type === 'radial' || o.type === 'corner') far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    let t;
    if (o.type === 'linear') t = ((px - W / 2) * sx + (py - H / 2) * sy) / (2 * half) + 0.5;
    else if (o.type === 'conic') t = ((Math.atan2(px - cx, -(py - cy)) - ang) / (2 * Math.PI) % 1 + 1) % 1;
    else t = Math.hypot(px - cx, py - cy) / far;
    const k = Math.max(0, Math.min(N - 1, Math.round(t * (N - 1)))) * 4, i = (y * W + x) * 4;
    d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2]; d[i + 3] = lut[k + 3];
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

const gradient = {
  id: 'colour-gradient', name: 'Gradient generator', group: G, icon: 'blend',
  desc: 'Linear, radial, conic, corner and mesh-style gradients — CSS to copy, or a PNG at any size.',
  keywords: 'gradient css linear radial conic mesh background oklch interpolation png wallpaper',
  accepts: ['colour'],
  render(root, incoming) {
    const o = { type: 'linear', space: 'oklch', angle: 90, cx: 50, cy: 50, corner: 'tl', spread: 60,
      stops: [{ c: M.parse(incoming?.colour || '#e8a33d'), pos: 0 }, { c: M.parse('#5b2a86'), pos: 100 }] };
    const type = tabs([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic'], ['corner', 'Corner'], ['mesh', 'Mesh']], 'linear', v => { o.type = v; layout(); draw(); });
    const space = select([['oklch', 'OKLCH (vivid, even)'], ['oklab', 'OKLab (smooth, no hue swing)'], ['srgb', 'sRGB (classic CSS, can look muddy)']], 'oklch');
    const angle = input({ type: 'range', min: 0, max: 360, step: 1, value: 90 });
    const cx = input({ type: 'range', min: 0, max: 100, value: 50 }), cy = input({ type: 'range', min: 0, max: 100, value: 50 });
    const corner = select(Object.entries(CORNERS).map(([k, v]) => [k, v[0]]), 'tl');
    const spread = input({ type: 'range', min: 20, max: 100, value: 60 });
    const fAngle = field('Angle', angle), fCx = field('Centre across', cx), fCy = field('Centre down', cy), fCorner = field('Corner', corner), fSpread = field('How far each point spreads', spread);
    const stopsBox = h('div', { class: 'cz-stops' });
    const prev = h('div', { class: 'cz-grad' });
    const css = output('CSS', { multiline: true, rows: 5 });
    const W = input({ type: 'number', value: 1920, min: 16, max: 8000 }), Hh = input({ type: 'number', value: 1080, min: 16, max: 8000 });
    const hint = h('p', { class: 'field-hint' });
    function layout() {
      fAngle.hidden = !['linear', 'conic'].includes(o.type);
      fCx.hidden = fCy.hidden = !['radial', 'conic'].includes(o.type);
      fCorner.hidden = o.type !== 'corner';
      fSpread.hidden = o.type !== 'mesh';
      space.disabled = o.type === 'mesh';
      hint.textContent = o.type === 'mesh' ? 'Mesh: the first colour is the base; each other colour glows from its own spot. The PNG blends in OKLab; the CSS stacks radial gradients, so the two differ slightly.'
        : !supportsIn ? 'This browser can’t interpolate in OKLCH itself, so the preview uses the baked fallback line.' : 'The first CSS line is a fallback with pre-mixed stops for older browsers; the second uses native OKLCH/OKLab mixing.';
    }
    function stopsUi() {
      stopsBox.replaceChildren(...o.stops.map((s, i) => {
        const cf = colourField(`Colour ${i + 1}`, hex(s.c), c => { s.c = c; draw(); });
        const pos = input({ type: 'range', min: 0, max: 100, value: s.pos });
        pos.addEventListener('input', () => { s.pos = +pos.value; draw(); });
        return h('div', { class: 'cz-stop' }, cf.el, field('Position', pos),
          h('div', { class: 'row tight' }, sendColourBtn(() => hex(s.c)),
            o.stops.length > 2 && h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Remove colour', onclick: () => { o.stops.splice(i, 1); stopsUi(); draw(); } }, icon('trash-2', 16))));
      }));
    }
    function draw() {
      o.space = space.value; o.angle = +angle.value; o.cx = +cx.value; o.cy = +cy.value; o.corner = corner.value; o.spread = +spread.value;
      const g = gradientCss(o);
      prev.removeAttribute('style');
      Object.assign(prev.style, g.preview);
      css.set(g.css);
    }
    const add = h('button', { type: 'button', class: 'btn small', onclick: () => {
      if (o.stops.length >= 7) return toast('Seven colours is the limit');
      const last = o.stops.at(-1);
      o.stops.forEach((s, i) => { s.pos = Math.round(i / o.stops.length * 100); });
      o.stops.push({ c: M.rotate(last.c, 50), pos: 100 }); stopsUi(); draw();
    } }, icon('plus', 16), ' Add colour');
    on([angle, cx, cy, spread], draw); space.addEventListener('change', draw); corner.addEventListener('change', draw);
    const getPng = () => { const w = Math.min(8000, Math.max(16, +W.value || 1920)), ht = Math.min(8000, Math.max(16, +Hh.value || 1080)); return canvasPng(renderGradient(o, w, ht)); };
    root.append(
      card(prev, type),
      h('div', { class: 'grid2' },
        card(heading('Colours'), stopsBox, h('div', { class: 'row' }, add)),
        card(heading('Shape'), field('Mix colours in', space), fAngle, fCx, fCy, fCorner, fSpread, hint)),
      card(css.el, h('div', { class: 'row' }, field('Width', W), field('Height', Hh)),
        h('div', { class: 'row' }, downloadBtn(() => `gradient-${W.value}x${Hh.value}.png`, getPng, 'Download PNG'),
          sendBtn(async () => ({ files: [await asFile(await getPng(), `gradient-${W.value}x${Hh.value}.png`)] })))));
    stopsUi(); layout(); draw();
  },
};

export default [atlas, contrastTool, harmonyTool, paletteGen, collection, extractor, picker, tailwind, cvdTool, gradient];
