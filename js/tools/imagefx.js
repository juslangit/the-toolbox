// Images drawer, effects half: matte, carousel slices, watermark, de-skew,
// shape masks, raster-to-vector, grain and on-device background removal.
// The canvas work lives in js/lib/fx-core.js so the workflow steps share it.
import { h, field, input, select, checkbox, note, row, card, tabs, dropzone, download, fmtBytes, progress, copy } from '../ui.js';
import { sendBtn } from '../hub.js';
import { askToFetch, markFetched } from '../lib/heavy.js';
import {
  canvas, ctx2d, decode, toFile, outName, keepType, extOf, matte, carousel, watermark, grain,
  maskShape, SHAPES, fitMax,
} from '../lib/fx-core.js';
import { slider, colourField, actions, stage, show } from '../lib/fx-ui.js';

const IMG = ['image/*'];
const pickLabel = 'Drop a picture here, or tap to choose one';

// Single-picture loader shared by most tools: a drop zone, an error line, and
// load(file) that decodes and calls onload(img, file).
function picker(onload, { label = pickLabel } = {}) {
  const err = note();
  const load = async f => {
    if (!f) return;
    err.clear();
    try { const img = await decode(f); await onload(img, f); }
    catch (e) { err.error(e.message || String(e)); }
  };
  const dz = dropzone({ accept: 'image/*', label, onfiles: fs => load(fs[0]) });
  dz.classList.add('fx-drop');
  return { el: h('div', { class: 'stack' }, dz, err.el), load, err };
}

// Debounce for sliders that redraw big pictures.
const later = (fn, ms = 60) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

async function zipFiles(files, name) {
  const { zipSync } = await import('../../vendor/fflate.js');
  const entries = {};
  for (const f of files) entries[f.name] = [new Uint8Array(await f.arrayBuffer()), { level: 0 }];
  return new File([zipSync(entries)], name, { type: 'application/zip' });
}

// --- 1. Matte --------------------------------------------------------------------
const RATIO_CHOICES = [['1:1', 'Square 1:1'], ['4:5', 'Portrait 4:5'], ['9:16', 'Story 9:16'], ['16:9', 'Wide 16:9']];
const BG_CHOICES = [['colour', 'Plain colour'], ['blur', 'Blurred copy'], ['none', 'Transparent']];

const matteTool = {
  id: 'img-matte', name: 'Matte generator', group: 'images', icon: 'frame',
  desc: 'Put a picture on a square, 4:5, story or wide canvas without cropping it.',
  keywords: 'matte border frame square instagram pad padding letterbox background fit no crop canvas 4:5 9:16 story',
  accepts: IMG,
  steps: [{
    id: 'img-matte', name: 'Put on a matte', accepts: IMG,
    options: [
      { key: 'ratio', label: 'Shape', type: 'select', value: '1:1', choices: RATIO_CHOICES },
      { key: 'bg', label: 'Background', type: 'select', value: 'colour', choices: BG_CHOICES },
      { key: 'colour', label: 'Colour', type: 'colour', value: '#ffffff' },
      { key: 'padding', label: 'Padding (%)', type: 'number', value: 6, min: 0, max: 40, step: 1 },
    ],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        ctx.progress(i / files.length, f.name);
        const c = matte(await decode(f), opts);
        const type = (opts.bg || 'colour') === 'none' ? 'image/png' : keepType(f);
        out.push(await toFile(c, outName(f.name, '-matte', extOf(type)), type, 0.92));
      }
      return out;
    },
  }],
  render(root, incoming) {
    let img = null, file = null, result = null;
    const ratio = select(RATIO_CHOICES, '1:1');
    const bg = select(BG_CHOICES, 'colour');
    const colour = colourField('Colour', '#ffffff');
    const pad = slider('Padding', { min: 0, max: 30, value: 6, fmt: v => v + '%' });
    const view = stage();
    const info = h('p', { class: 'field-hint' });
    const out = card(view, info, actions(() => result && toFile(result.c, result.name, result.type, 0.92)));
    out.hidden = true;
    const draw = later(() => {
      if (!img) return;
      const opts = { ratio: ratio.value, bg: bg.value, colour: colour.value, padding: pad.value };
      const c = matte(img, opts);
      const type = opts.bg === 'none' ? 'image/png' : keepType(file);
      result = { c, type, name: outName(file.name, '-matte', extOf(type)) };
      show(view, c);
      info.textContent = `${c.width} × ${c.height} px`;
      out.hidden = false;
    });
    const sync = () => { colour.el.hidden = bg.value !== 'colour'; draw(); };
    for (const e of [ratio, bg, colour.input, pad.input]) { e.addEventListener('input', sync); e.addEventListener('change', sync); }
    const pick = picker((i, f) => { img = i; file = f; sync(); });
    root.append(card(pick.el,
      h('div', { class: 'row' }, field('Shape', ratio), field('Background', bg), colour.el), pad.el), out);
    sync();
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
  },
};

// --- 2. Seamless carousel ------------------------------------------------------------
const scrollTool = {
  id: 'img-carousel', name: 'Seamless scroll', group: 'images', icon: 'gallery-horizontal',
  desc: 'Cut a wide picture into Instagram carousel slides that join up as you swipe.',
  keywords: 'seamless scroll carousel instagram panorama split slices swipe slides wide 4:5 square',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, made = null;
    const n = slider('Slides', { min: 2, max: 10, value: 3 });
    const ratio = select([['1:1', 'Square 1:1'], ['4:5', 'Portrait 4:5']], '1:1');
    const fmt = select([['image/jpeg', 'JPEG'], ['image/png', 'PNG']], 'image/jpeg');
    const pos = slider('Crop position', { min: 0, max: 100, value: 50, fmt: v => v + '%', hint: 'If the picture does not fill the strip exactly, choose which part to keep.' });
    const strip = h('div', { class: 'fx-strip' });
    const info = h('p', { class: 'field-hint' });
    const files = async () => {
      const type = fmt.value, ext = extOf(type);
      const base = (file.name || 'carousel').replace(/\.[^.]+$/, '');
      return Promise.all(made.slides.map((c, i) => toFile(c, `${base}-${String(i + 1).padStart(2, '0')}.${ext}`, type, 0.92)));
    };
    const saveZip = h('button', {
      class: 'btn small primary', type: 'button',
      onclick: async () => { if (made) download(outName(file.name, '-carousel', 'zip'), await zipFiles(await files(), 'carousel.zip')); },
    }, 'Download all (zip)');
    const out = card(strip, info, row(saveZip, sendBtn(async () => made && { files: await files() })),
      h('p', { class: 'field-hint' }, 'Post the slides in order, numbered 01 onwards. Instagram shows them edge to edge, so the picture flows across as you swipe.'));
    out.hidden = true;
    const draw = later(() => {
      if (!img) return;
      made = carousel(img, { n: n.value, ratio: ratio.value, pos: pos.value });
      strip.replaceChildren(...made.slides.map((c, i) => h('figure', { class: 'fx-slide' }, c, h('figcaption', {}, String(i + 1)))));
      const s = made.slides[0];
      const iw = img.w, ih = img.h;
      const need = n.value * s.width / s.height;
      const fit = iw / ih;
      info.textContent = `${made.slides.length} slides · ${s.width} × ${s.height} px each` +
        (Math.abs(fit - need) / need > 0.03 ? ` · the picture is ${fit > need ? 'wider' : 'taller'} than the strip, so some of it is cropped` : '');
      out.hidden = false;
    });
    for (const e of [n.input, ratio, pos.input, fmt]) { e.addEventListener('input', draw); e.addEventListener('change', draw); }
    const pick = picker((i, f) => { img = i; file = f; draw(); }, { label: 'Drop a wide picture here, or tap to choose one' });
    root.append(card(pick.el, h('div', { class: 'row' }, field('Slide shape', ratio), field('Save as', fmt)), n.el, pos.el), out);
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
  },
};

// --- 3. Watermark ------------------------------------------------------------------------
const POS_CHOICES = [['tl', 'Top left'], ['t', 'Top'], ['tr', 'Top right'], ['l', 'Left'], ['c', 'Centre'], ['r', 'Right'],
  ['bl', 'Bottom left'], ['b', 'Bottom'], ['br', 'Bottom right'], ['tile', 'Tiled all over']];

const watermarkTool = {
  id: 'img-watermark', name: 'Watermarker', group: 'images', icon: 'stamp',
  desc: 'Stamp text or your logo on one picture or a whole batch.',
  keywords: 'watermark copyright logo stamp text brand protect batch overlay signature tile',
  accepts: IMG,
  steps: [{
    id: 'img-watermark', name: 'Add a text watermark', accepts: IMG,
    options: [
      { key: 'text', label: 'Text', type: 'text', value: '© ' + new Date().getFullYear() },
      { key: 'position', label: 'Position', type: 'select', value: 'br', choices: POS_CHOICES.filter(([v]) => ['br', 'bl', 'tr', 'tl', 'c', 'tile'].includes(v)) },
      { key: 'opacity', label: 'Opacity', type: 'range', value: 0.6, min: 0.05, max: 1, step: 0.05 },
      { key: 'size', label: 'Width (% of picture)', type: 'number', value: 25, min: 2, max: 100, step: 1 },
      { key: 'colour', label: 'Colour', type: 'colour', value: '#ffffff' },
    ],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        ctx.progress(i / files.length, f.name);
        const c = watermark(await decode(f), { rotation: opts.position === 'tile' ? -30 : 0, ...opts });
        const type = keepType(f);
        out.push(await toFile(c, outName(f.name, '-watermarked', extOf(type)), type, 0.92));
      }
      return out;
    },
  }],
  render(root, incoming) {
    let list = [], imgs = [], logo = null, cur = 0;
    const mode = tabs([['text', 'Text'], ['logo', 'Logo picture']], 'text', () => sync());
    const text = input({ value: '© ' + new Date().getFullYear() + ' ' });
    const font = select([['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']], 'sans');
    const colour = colourField('Colour', '#ffffff');
    const shade = checkbox('Soft shadow so it shows on any background', true);
    const logoDrop = dropzone({ accept: 'image/*', label: 'Drop your logo (a PNG with a transparent background works best)', onfiles: async fs => { logo = await decode(fs[0]); logoName.textContent = fs[0].name; draw(); } });
    logoDrop.classList.add('fx-drop', 'small');
    const logoName = h('span', { class: 'pill' });
    const position = select(POS_CHOICES, 'br');
    const size = slider('Size', { min: 3, max: 100, value: 25, fmt: v => v + '% of the width' });
    const opacity = slider('Opacity', { min: 5, max: 100, value: 60, step: 5, fmt: v => v + '%' });
    const rotation = slider('Rotation', { min: -90, max: 90, value: 0, step: 1, fmt: v => v + '°' });
    const textPane = h('div', { class: 'stack' }, field('Text', text), h('div', { class: 'row' }, field('Font', font), colour.el), shade);
    const logoPane = h('div', { class: 'stack', hidden: true }, logoDrop, logoName);
    const view = stage();
    const picks = h('div', { class: 'chips' });
    const info = h('p', { class: 'field-hint' });

    const opts = () => ({
      text: mode.value === 'text' ? text.value : '', logo: mode.value === 'logo' ? logo : null,
      font: font.value, colour: colour.value, outline: shade.input.checked,
      position: position.value, size: size.value, opacity: opacity.value / 100, rotation: rotation.value,
    });
    const render1 = async (i, f) => {
      const c = watermark(i, opts());
      const type = keepType(f);
      return toFile(c, outName(f.name, '-watermarked', extOf(type)), type, 0.92);
    };
    const all = async () => {
      const out = [];
      for (const [k, f] of list.entries()) out.push(await render1(imgs[k], f));
      return out;
    };
    const save = h('button', {
      class: 'btn small primary', type: 'button',
      onclick: async () => {
        if (!list.length) return;
        save.disabled = true;
        try {
          const files = await all();
          if (files.length === 1) download(files[0].name, files[0]);
          else download('watermarked.zip', await zipFiles(files, 'watermarked.zip'));
        } finally { save.disabled = false; }
      },
    }, 'Download');
    const out = card(picks, view, info, row(save, sendBtn(async () => list.length ? { files: await all() } : null)));
    out.hidden = true;

    const draw = later(() => {
      if (!imgs.length) return;
      const c = watermark(imgs[cur], opts());
      show(view, c);
      info.textContent = list.length > 1 ? `Showing ${cur + 1} of ${list.length}. Download saves all of them in one zip.` : `${c.width} × ${c.height} px`;
      save.textContent = list.length > 1 ? `Download all ${list.length} (zip)` : 'Download';
      out.hidden = false;
    }, 80);
    function sync() {
      textPane.hidden = mode.value !== 'text';
      logoPane.hidden = mode.value !== 'logo';
      draw();
    }
    const err = note();
    async function load(files) {
      err.clear();
      const ok = [], dec = [];
      for (const f of files) {
        try { dec.push(await decode(f)); ok.push(f); } catch (e) { err.error(e.message); }
      }
      if (!ok.length) return;
      list = ok; imgs = dec; cur = 0;
      picks.replaceChildren(...(list.length > 1 ? list.map((f, i) => h('button', {
        type: 'button', class: 'chip' + (i ? '' : ' on'),
        onclick: e => { cur = i; for (const b of picks.children) b.classList.toggle('on', b === e.currentTarget); draw(); },
      }, f.name)) : []));
      draw();
    }
    const dz = dropzone({ accept: 'image/*', multiple: true, label: 'Drop one or more pictures here, or tap to choose', onfiles: load });
    dz.classList.add('fx-drop');
    for (const e of [text, font, colour.input, shade.input, position, size.input, opacity.input, rotation.input]) { e.addEventListener('input', draw); e.addEventListener('change', draw); }
    root.append(card(dz, err.el), card(mode, textPane, logoPane, field('Position', position), size.el, opacity.el, rotation.el), out);
    sync();
    if (incoming?.files?.length) load(incoming.files);
  },
};

// --- 4. De-skew ------------------------------------------------------------------------------
const PAPER = [['auto', 'From the corners'], ['0.7071', 'A4 / A-size paper, upright'], ['1.4142', 'A4 / A-size paper, sideways'],
  ['0.7727', 'US Letter, upright'], ['1.7778', 'Screen 16:9'], ['1.3333', 'Screen or photo 4:3'], ['1', 'Square']];

const deskewTool = {
  id: 'img-deskew', name: 'Image de-skewer', group: 'images', icon: 'scan-line',
  desc: 'Drag four corners onto a photo of a page or screen and get it flat and straight.',
  keywords: 'deskew perspective straighten flatten document scan page whiteboard screen keystone warp corners crop',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, corners = null, small = null, srcFull = null, result = null;
    let W = 0, H = 0;
    const wrap = h('div', { class: 'fx-deskew' });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'fx-quad');
    svg.setAttribute('preserveAspectRatio', 'none');
    const poly = document.createElementNS(svgNS, 'polygon');
    svg.append(poly);
    const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
    const handles = names.map((n, i) => h('button', { type: 'button', class: 'fx-handle', 'aria-label': `Move the ${n} corner (arrow keys nudge it)`, 'data-i': i }));
    const ratio = select(PAPER, 'auto');
    const view = stage('fx-flat');
    const info = h('p', { class: 'field-hint' });
    const err = note();
    let lib = null;

    const place = () => {
      if (!corners) return;
      handles.forEach((b, i) => { b.style.left = (corners[i][0] / W * 100) + '%'; b.style.top = (corners[i][1] / H * 100) + '%'; });
      poly.setAttribute('points', corners.map(p => p.join(',')).join(' '));
    };
    const outSize = (q, scale = 1) => {
      let [w, hh] = lib.quadSize(q);
      if (ratio.value !== 'auto') { const r = +ratio.value; const area = w * hh; w = Math.sqrt(area * r); hh = w / r; }
      const s = Math.min(1, 6000 / Math.max(w, hh)) * scale;
      return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(hh * s))];
    };
    const flatten = later(() => {
      if (!img || !lib) return;
      if (!lib.quadOk(corners)) { err.error('Those corners cross over — put them on the four corners in order, clockwise from top left.'); return; }
      err.clear();
      // Preview from a smaller copy, so dragging stays quick.
      const k = small.width / W;
      const q = corners.map(([x, y]) => [x * k, y * k]);
      const [fw, fh] = outSize(corners);
      const ps = Math.min(1, 900 / Math.max(fw, fh));
      const c = lib.warp(small.data, q, Math.round(fw * ps), Math.round(fh * ps));
      show(view, c);
      info.textContent = `Full size: ${fw} × ${fh} px`;
      out.hidden = false;
      result = null;
    }, 90);
    const full = async () => {
      if (!img) return null;
      if (!result) {
        if (!srcFull) {
          const [sw, sh] = fitMax(W, H, 6000);
          const c = canvas(sw, sh), x = ctx2d(c, true);
          x.drawImage(img, 0, 0, sw, sh);
          srcFull = { k: sw / W, data: x.getImageData(0, 0, sw, sh) };
        }
        const q = corners.map(([x, y]) => [x * srcFull.k, y * srcFull.k]);
        const [fw, fh] = outSize(corners);
        const c = lib.warp(srcFull.data, q, fw, fh);
        const type = keepType(file);
        result = await toFile(c, outName(file.name, '-flat', extOf(type)), type, 0.92);
      }
      return result;
    };
    const out = card(view, info, actions(full));
    out.hidden = true;
    const reset = (inset = 0.1) => {
      corners = [[W * inset, H * inset], [W * (1 - inset), H * inset], [W * (1 - inset), H * (1 - inset)], [W * inset, H * (1 - inset)]];
      place(); flatten();
    };

    // Dragging: pointer events work for mouse, pen and touch alike.
    handles.forEach((b, i) => {
      let off = null;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch {}
        const r = wrap.getBoundingClientRect();
        off = [corners[i][0] - (e.clientX - r.left) / r.width * W, corners[i][1] - (e.clientY - r.top) / r.height * H];
        b.classList.add('on');
      });
      b.addEventListener('pointermove', e => {
        if (!off) return;
        const r = wrap.getBoundingClientRect();
        corners[i] = [Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W + off[0])), Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H + off[1]))];
        place(); flatten();
      });
      const end = () => { off = null; b.classList.remove('on'); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('keydown', e => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * Math.max(1, W / 400);
        corners[i] = [Math.max(0, Math.min(W, corners[i][0] + d[0] * step)), Math.max(0, Math.min(H, corners[i][1] + d[1] * step))];
        place(); flatten();
      });
    });
    ratio.addEventListener('change', () => { result = null; flatten(); });

    const pick = picker(async (i, f) => {
      lib = lib || await import('../lib/fx-warp.js');
      img = i; file = f; W = i.w; H = i.h; srcFull = null;
      const [dw, dh] = fitMax(W, H, 1400);
      const disp = canvas(dw, dh), dx = ctx2d(disp, true);
      dx.drawImage(i, 0, 0, dw, dh);
      small = { width: dw, data: dx.getImageData(0, 0, dw, dh) };
      disp.className = 'fx-deskew-img';
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      wrap.replaceChildren(disp, svg, ...handles);
      wrap.style.aspectRatio = `${W} / ${H}`;
      wrap.style.width = `min(100%, ${(70 * W / H).toFixed(2)}vh)`;
      editor.hidden = false;
      reset();
    }, { label: 'Drop a photo of a page, receipt, whiteboard or screen' });
    const editor = card(
      h('p', { class: 'field-hint' }, 'Drag each round handle onto a corner of the page. Arrow keys nudge a selected handle.'),
      wrap,
      h('div', { class: 'row' }, field('Shape of the result', ratio),
        h('button', { class: 'btn small', type: 'button', onclick: () => reset(0.1) }, 'Reset corners'),
        h('button', { class: 'btn small', type: 'button', onclick: () => reset(0) }, 'Whole picture')),
      err.el);
    editor.hidden = true;
    root.append(card(pick.el), editor, out);
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
  },
};

// --- 5. Masker --------------------------------------------------------------------------
const maskTool = {
  id: 'img-mask', name: 'Image masker', group: 'images', icon: 'squircle',
  desc: 'Cut a picture into a circle, squircle, hexagon, star, heart or blob, with a see-through background.',
  keywords: 'mask shape circle crop round avatar profile squircle hexagon star heart blob transparent png cutout sticker',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, seed = 1, c = null;
    const shape = tabs(SHAPES, 'circle', () => { newBlob.hidden = shape.value !== 'blob'; draw(); });
    const newBlob = h('button', { class: 'btn small', type: 'button', hidden: true, onclick: () => { seed++; draw(); } }, 'Another blob');
    const zoom = slider('Zoom', { min: 100, max: 300, value: 100, step: 5, fmt: v => v + '%' });
    const fx = slider('Left ↔ right', { min: 0, max: 100, value: 50, fmt: v => v + '%' });
    const fy = slider('Up ↕ down', { min: 0, max: 100, value: 50, fmt: v => v + '%' });
    const outline = slider('Outline', { min: 0, max: 10, value: 0, step: 0.5, fmt: v => v ? v + '%' : 'none' });
    const oc = colourField('Outline colour', '#ffffff');
    const view = stage('fx-square');
    const info = h('p', { class: 'field-hint' });
    const out = card(view, info, actions(() => c && toFile(c, outName(file.name, '-' + shape.value), 'image/png')));
    out.hidden = true;
    const draw = later(() => {
      if (!img) return;
      c = maskShape(img, { shape: shape.value, seed, zoom: zoom.value / 100, fx: fx.value / 100, fy: fy.value / 100, outline: outline.value, outlineColour: oc.value });
      show(view, c);
      info.textContent = `${c.width} × ${c.height} px PNG with a transparent background`;
      out.hidden = false;
    });
    for (const e of [zoom.input, fx.input, fy.input, outline.input, oc.input]) e.addEventListener('input', draw);
    const pick = picker((i, f) => { img = i; file = f; draw(); });
    root.append(card(pick.el, shape, newBlob, zoom.el, h('div', { class: 'grid2' }, fx.el, fy.el), h('div', { class: 'row' }, h('div', { class: 'fx-grow' }, outline.el), oc.el)), out);
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
  },
};

// --- 6. Tracer -----------------------------------------------------------------------------
const DETAIL = {
  low: { ltres: 2, qtres: 2, pathomit: 24 },
  medium: { ltres: 1, qtres: 1, pathomit: 8 },
  high: { ltres: 0.5, qtres: 0.5, pathomit: 2 },
};
const traceTool = {
  id: 'img-trace', name: 'Image tracer', group: 'images', icon: 'vector-square',
  desc: 'Turn a picture into an SVG vector made of flat-colour shapes.',
  keywords: 'trace vectorise vectorize svg vector raster to vector logo potrace convert outline paths',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, svgText = '', url = null, tracer = null, busy = false, again = false;
    const colours = slider('Colours', { min: 2, max: 32, value: 8 });
    const detail = select([['low', 'Low — smooth, small file'], ['medium', 'Medium'], ['high', 'High — every little edge']], 'medium');
    const maxSide = select([['400', '400 px (fast)'], ['800', '800 px'], ['1200', '1200 px'], ['2000', '2000 px (slow)']], '800');
    const smooth = checkbox('Smooth the picture first (fewer specks)', true);
    const before = h('div', { class: 'fx-stage fx-checker' });
    const after = h('div', { class: 'fx-stage fx-checker' });
    const info = h('p', { class: 'field-hint' });
    const prog = progress();
    const svgFile = () => svgText ? new File([svgText], outName(file.name, '', 'svg'), { type: 'image/svg+xml' }) : null;
    const out = card(h('div', { class: 'grid2' },
      h('div', { class: 'stack' }, h('span', { class: 'field-label' }, 'Original'), before),
      h('div', { class: 'stack' }, h('span', { class: 'field-label' }, 'Vector'), after)),
    info, prog.el,
    row(...actions(svgFile, 'Download SVG').children, h('button', { class: 'btn small', type: 'button', onclick: () => svgText && copy(svgText) }, 'Copy SVG code')),
    h('p', { class: 'field-hint' }, 'Works best on logos, icons, drawings and flat artwork. Photos turn into a poster-like look with many shapes.'));
    out.hidden = true;

    async function trace() {
      if (!img) return;
      if (busy) { again = true; return; }
      busy = true;
      try {
        out.hidden = false;
        prog.set(0.3); prog.label('Tracing…');
        if (!tracer) tracer = (await import('../../vendor/imagetracer.js')).default;
        await new Promise(r => setTimeout(r, 30)); // let the label paint
        const [w, hh] = fitMax(img.w, img.h, +maxSide.value);
        const c = canvas(w, hh), x = ctx2d(c, true);
        x.drawImage(img, 0, 0, w, hh);
        const data = x.getImageData(0, 0, w, hh);
        const t0 = performance.now();
        svgText = tracer.imagedataToSVG(data, {
          ...DETAIL[detail.value], numberofcolors: colours.value, colorsampling: 2, colorquantcycles: 3,
          blurradius: smooth.input.checked ? 2 : 0, blurdelta: 20, strokewidth: 1, roundcoords: 1, viewbox: true, desc: false,
        });
        // Scale up the drawing size to the original picture's size (viewBox keeps the shapes).
        svgText = svgText.replace('<svg ', `<svg width="${img.w}" height="${img.h}" `);
        const ms = performance.now() - t0;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
        after.replaceChildren(h('img', { src: url, alt: 'Traced vector' }));
        const shapes = (svgText.match(/<path/g) || []).length;
        info.textContent = `${shapes.toLocaleString()} shapes · ${fmtBytes(new Blob([svgText]).size)} · traced in ${(ms / 1000).toFixed(1)} s`;
        prog.hide();
      } catch (e) {
        prog.hide(); info.textContent = 'Tracing failed: ' + e.message;
      } finally {
        busy = false;
        if (again) { again = false; trace(); }
      }
    }
    const go = later(trace, 350);
    for (const e of [colours.input, detail, maxSide, smooth.input]) e.addEventListener('change', go);
    colours.input.addEventListener('input', go);
    const pick = picker((i, f) => {
      img = i; file = f;
      const [w, hh] = fitMax(i.w, i.h, 900);
      const c = canvas(w, hh); ctx2d(c).drawImage(i, 0, 0, w, hh);
      show(before, c);
      go();
    });
    root.append(card(pick.el, colours.el, h('div', { class: 'row' }, field('Detail', detail), field('Work at', maxSide)), smooth), out);
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
    return () => { if (url) URL.revokeObjectURL(url); };
  },
};

// --- 7. Grain ---------------------------------------------------------------------------
const grainTool = {
  id: 'img-grain', name: 'Grain & noise', group: 'images', icon: 'sparkles',
  desc: 'Add film grain or colour noise to give flat or AI-looking pictures some texture.',
  keywords: 'grain noise film texture analog analogue artwork enhancer dither banding vintage',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, c = null, seed = 7;
    const amount = slider('Amount', { min: 0, max: 100, value: 25, fmt: v => v + '%' });
    const size = slider('Grain size', { min: 1, max: 6, value: 1, step: 0.5, fmt: v => v + ' px' });
    const mono = checkbox('Monochrome (film grain) — untick for colour noise', true);
    const view = stage();
    const zoomed = h('div', { class: 'fx-zoom' });
    const info = h('p', { class: 'field-hint' });
    const out = card(view,
      h('div', { class: 'stack' }, h('span', { class: 'field-label' }, 'Close-up at 100%'), zoomed),
      info,
      row(...actions(() => c && toFile(c, outName(file.name, '-grain', extOf(keepType(file))), keepType(file), 0.95)).children,
        h('button', { class: 'btn small', type: 'button', onclick: () => { seed++; draw(); } }, 'Shuffle the grain')));
    out.hidden = true;
    const draw = later(() => {
      if (!img) return;
      c = grain(img, { amount: amount.value, size: size.value, mono: mono.input.checked, seed });
      show(view, c);
      // A 1:1 crop from the middle so the grain can actually be seen.
      const z = canvas(Math.min(c.width, 360), Math.min(c.height, 240));
      ctx2d(z).drawImage(c, (c.width - z.width) / 2, (c.height - z.height) / 2, z.width, z.height, 0, 0, z.width, z.height);
      zoomed.replaceChildren(z);
      info.textContent = `${c.width} × ${c.height} px`;
      out.hidden = false;
    }, 80);
    for (const e of [amount.input, size.input, mono.input]) { e.addEventListener('input', draw); e.addEventListener('change', draw); }
    const pick = picker((i, f) => { img = i; file = f; draw(); });
    root.append(card(pick.el, amount.el, size.el, mono), out);
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
  },
};

// --- 8. Background remover -----------------------------------------------------------------
const NEED_MODEL = 'The background-removal model is not on this device yet. Open the Background remover tool once to download it, then run this workflow again.';

const bgTool = {
  id: 'img-bg-remove', name: 'Background remover', group: 'images', icon: 'eraser',
  desc: 'Cut the subject out of a photo with AI that runs on your device — nothing is uploaded.',
  keywords: 'remove background cutout cut out transparent png ai segmentation product person subject erase backdrop',
  accepts: IMG,
  steps: [{
    id: 'img-bg-remove', name: 'Remove the background', accepts: IMG, options: [],
    async run(files, opts, ctx) {
      const bg = await import('../lib/fx-bg.js');
      if (!bg.modelReady()) throw new Error(NEED_MODEL);
      const out = [];
      for (const [i, f] of files.entries()) {
        const cut = await bg.removeBackground(await decode(f), (v, l) => ctx.progress((i + v * 0.5) / files.length, l || f.name));
        out.push(await toFile(cut, outName(f.name, '-cutout'), 'image/png'));
        ctx.progress((i + 1) / files.length, f.name);
      }
      return out;
    },
  }],
  render(root, incoming) {
    let cut = null, file = null, img = null, ready = false, alive = true;
    const bg = import('../lib/fx-bg.js');
    const fill = tabs([['none', 'Transparent'], ['colour', 'Colour']], 'none', () => { colour.el.hidden = fill.value !== 'colour'; compose(); });
    const colour = colourField('Background colour', '#ffffff');
    colour.el.hidden = true;
    const view = stage();
    const prog = progress();
    const info = h('p', { class: 'field-hint' });
    let final = null;
    const getFile = () => final && toFile(final, outName(file.name, fill.value === 'none' ? '-cutout' : '-new-bg', fill.value === 'none' ? 'png' : extOf(keepType(file))),
      fill.value === 'none' ? 'image/png' : keepType(file), 0.92);
    const out = card(fill, colour.el, view, info, actions(getFile));
    out.hidden = true;

    function compose() {
      if (!cut) return;
      final = cut;
      if (fill.value === 'colour') {
        final = canvas(cut.width, cut.height);
        const x = ctx2d(final);
        x.fillStyle = colour.value; x.fillRect(0, 0, cut.width, cut.height);
        x.drawImage(cut, 0, 0);
      }
      show(view, final);
      out.hidden = false;
    }
    colour.input.addEventListener('input', compose);

    async function run() {
      if (!img || !ready) return;
      const m = await bg;
      pick.err.clear();
      try {
        out.hidden = true;
        const t0 = performance.now();
        const [w, hh] = fitMax(img.w, img.h, 4096);
        const src = w === img.w ? img : (() => { const c = canvas(w, hh); ctx2d(c).drawImage(img, 0, 0, w, hh); c.w = w; c.h = hh; return c; })();
        cut = await m.removeBackground(src, (v, l) => { prog.set(v); prog.label(l); });
        if (!alive) return;
        prog.hide();
        info.textContent = `${cut.width} × ${cut.height} px · done in ${((performance.now() - t0) / 1000).toFixed(1)} s on the ${m.usedDevice() === 'webgpu' ? 'graphics chip' : 'processor'}`;
        compose();
      } catch (e) {
        prog.hide();
        pick.err.error('Could not remove the background: ' + (e.message || e));
      }
    }
    const pick = picker((i, f) => { img = i; file = f; cut = null; if (!ready) info.textContent = ''; run(); if (!ready) pick.err.info('Picture loaded. Download the model above to start.'); });
    root.append(card(pick.el, prog.el,
      h('p', { class: 'field-hint' }, 'Works best on a clear subject: a person, pet or product. Fine hair, glass and things that blend into the background can come out rough. Your picture never leaves this device.')), out);
    (async () => {
      const m = await bg;
      await askToFetch(root, { id: m.BG.id, what: 'the background-removal model', mb: m.BG.mb,
        why: `Background removal uses an AI model (ormbg, Apache-2.0 licence) that runs on this device. It is downloaded once (about ${m.BG.mb} MB), kept on this device, and then works offline. Your pictures never leave the device.` });
      if (!alive) return;
      pick.err.clear();
      prog.set(0); prog.label('Getting the model ready…');
      try {
        await m.loadRemover((v, l) => { prog.set(v); prog.label(l); });
        markFetched(m.BG.id);
        ready = true;
        prog.label('Model ready.'); prog.set(1);
        if (img) run(); else prog.hide();
      } catch (e) {
        prog.hide();
        pick.err.error('Could not load the model: ' + (e.message || e) + ' — check the connection and try again.');
      }
    })();
    if (incoming?.files?.[0]) pick.load(incoming.files[0]);
    return () => { alive = false; };
  },
};

export default [matteTool, scrollTool, watermarkTool, deskewTool, maskTool, traceTool, grainTool, bgTool];
