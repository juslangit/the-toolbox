// Images drawer (core): atlas, compress, convert, resize, social crop, strip
// metadata, favicons, trim, split, stitch, SVG optimiser, Base64, paste.
// Everything runs on the device; nothing is uploaded.
import { h, field, input, select, checkbox, output, note, row, card, grid, tabs, on, download, dropzone, downloadBtn, fmtBytes, rename, progress, textarea, loadImage } from '../ui.js';
import { hub, sendBtn, sendTo, accepts, asFile } from '../hub.js';
import { icon } from '../icons.js';
import * as core from '../lib/img-core.js';
import * as meta from '../lib/img-meta.js';

const G = 'images';
const IMG = ['image/*'];

// --- small shared pieces ------------------------------------------------------------
// Object URLs made during one tool visit, revoked when the tool closes.
function bag() {
  const urls = [];
  return { url(b) { const u = URL.createObjectURL(b); urls.push(u); return u; }, done() { urls.forEach(u => URL.revokeObjectURL(u)); urls.length = 0; } };
}
const dims = c => `${c.width} × ${c.height}`;
const bytesOf = async f => new Uint8Array(await f.arrayBuffer());
const labelOf = t => core.FORMATS[t]?.label?.replace(/ \(.*/, '') || (t || '').replace('image/', '').toUpperCase() || 'Unknown';
const pct = (a, b) => Math.round((1 - b / a) * 100);
function sizeChange(before, after) {
  const p = pct(before, after);
  return `${fmtBytes(before)} → ${fmtBytes(after)}` + (p > 0 ? ` (${p}% smaller)` : p < 0 ? ` (${-p}% bigger)` : '');
}
const imgDrop = (onfiles, multiple = false, label) => dropzone({ accept: 'image/*', multiple, label: label || (multiple ? 'Drop pictures here, or tap to choose' : 'Drop a picture here, or tap to choose one'), onfiles });
const uniqueNames = files => {
  const seen = new Map();
  return files.map(f => {
    let n = f.name, i = seen.get(n) || 0;
    seen.set(f.name, i + 1);
    if (i) n = f.name.replace(/(\.[^.]+)?$/, `-${i + 1}$1`);
    return [n, f];
  });
};
export async function zip(files) {
  const { zipSync } = await import('../../vendor/fflate.js');
  const entries = {};
  for (const [n, f] of uniqueNames(files)) entries[n] = [await bytesOf(f), { level: /\.(jpe?g|png|webp|avif|gif|zip)$/i.test(n) ? 0 : 6 }];
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}
const range = (min, max, value, step = 1) => h('input', { type: 'range', class: 'img-range', min, max, step, value });
const numberIn = (value, min, max, step = 1) => { const i = input({ type: 'number', value, min, max, step }); i.inputMode = 'numeric'; return i; };
const colourIn = value => h('input', { type: 'color', class: 'swatch-input', value });
const fmtType = async () => {
  const list = [['image/jpeg', 'JPEG'], ['image/webp', 'WebP'], ['image/avif', 'AVIF'], ['image/png', 'PNG']];
  const out = [];
  for (const [t, l] of list) if (await core.canEncode(t)) out.push([t, l]);
  return out;
};

// A list of result files with thumbnails, each with Download, plus Download all and Send.
function fileList(b, { zipName = 'pictures.zip' } = {}) {
  const list = h('div', { class: 'img-files' });
  const foot = h('div', { class: 'row img-files-foot', hidden: true });
  let files = [];
  const el = h('div', { class: 'stack' }, list, foot);
  return {
    el,
    get files() { return files; },
    async set(items) { // items: [{ file, before?, note?, w?, h? }]
      files = items.map(i => i.file);
      list.files = files; // read by the tests
      list.replaceChildren(...items.map(it => {
        const f = it.file;
        const thumb = /^image\//.test(f.type) && !/icns|x-icon/.test(f.type) ? h('img', { src: b.url(f), alt: '', loading: 'lazy' }) : h('span', { class: 'img-file-ext' }, (f.name.split('.').pop() || '').toUpperCase());
        return h('div', { class: 'img-file', 'data-name': f.name, 'data-type': f.type, 'data-w': it.w ?? '', 'data-h': it.h ?? '', 'data-size': f.size },
          h('div', { class: 'img-thumb img-checker' }, thumb),
          h('div', { class: 'img-file-text' },
            h('strong', {}, f.name),
            h('span', {}, [it.w ? `${it.w} × ${it.h}` : null, it.before ? sizeChange(it.before, f.size) : fmtBytes(f.size)].filter(Boolean).join(' · ')),
            it.note && h('span', { class: 'img-file-note' }, it.note)),
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Download ' + f.name, onclick: () => download(f.name, f) }, icon('download', 16)));
      }));
      foot.hidden = !files.length;
      foot.replaceChildren(...[
        files.length > 1 && h('button', { class: 'btn small primary', type: 'button', onclick: async () => download(zipName, await zip(files)) }, icon('file-archive', 16), ` Download all (.zip)`),
        files.length === 1 && h('button', { class: 'btn small primary', type: 'button', onclick: () => download(files[0].name, files[0]) }, icon('download', 16), ' Download'),
        sendBtn(() => files.length ? { files } : null)].filter(Boolean));
    },
    clear() { files = []; list.replaceChildren(); foot.hidden = true; },
  };
}

// --- shared operations (used by the tools and by workflow steps) --------------------
// Same format as the original if we can write it, else PNG.
async function sameType(file) {
  const t = core.typeOf(file);
  if (['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'].includes(t) && await core.canEncode(t)) return t;
  return /hei[cf]/.test(t) ? 'image/jpeg' : 'image/png';
}

export async function stripFile(file) {
  const bytes = await bytesOf(file);
  const clean = meta.strip(bytes);
  if (clean) return { file: new File([clean], file.name, { type: file.type || core.typeOf(file) }), reencoded: false };
  // Formats that can't be cleaned in place (HEIC, AVIF, BMP, TIFF, SVG…): save the pixels again.
  const c = await core.decode(file);
  const type = /hei[cf]|avif|tiff/.test(core.typeOf(file)) && !core.hasAlpha(c) ? 'image/jpeg' : 'image/png';
  const blob = await core.encode(c, type, 0.92);
  return { file: new File([blob], rename(file.name, core.extOf(type)), { type }), reencoded: true };
}

// size(c) → [width, height] for the decoded picture c.
async function resizeFile(file, size, { type, quality = 0.9 } = {}) {
  const c = await core.decode(file);
  const out = core.resize(c, ...size(c));
  const t = type || await sameType(file);
  const blob = await core.encode(out, t, quality);
  return { file: new File([blob], rename(file.name, core.extOf(t)), { type: t }), w: out.width, h: out.height };
}

export async function convertFile(file, format, quality = 0.85, { max = 0, background = '#ffffff' } = {}) {
  const { type, note: fallback } = await core.pickType(format);
  let c = await core.decode(file, { svgSize: max || 1024 });
  if (max) c = core.fitMax(c, max);
  const blob = await core.encode(c, type, quality, { background });
  return { file: new File([blob], rename(file.name, core.extOf(type)), { type }), note: fallback, w: c.width, h: c.height };
}

export async function trimFile(file, { mode = 'auto', tolerance = 10, pad = 0 } = {}) {
  const c = await core.decode(file);
  const box = core.trimBox(c, { mode, tolerance });
  if (!box) return { file: new File([file], file.name, { type: file.type }), box: null, w: c.width, h: c.height };
  const out = core.canvas(box.w + pad * 2, box.h + pad * 2);
  const x = out.getContext('2d');
  if (box.mode === 'colour' && pad) { x.fillStyle = box.bg; x.fillRect(0, 0, out.width, out.height); }
  x.drawImage(c, box.x, box.y, box.w, box.h, pad, pad, box.w, box.h);
  const blob = await core.encode(out, 'image/png');
  return { file: new File([blob], rename(file.name, 'png', '-trimmed'), { type: 'image/png' }), box, w: out.width, h: out.height, from: c };
}

const FAVICONS = [
  ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['apple-touch-icon.png', 180, 'apple'],
  ['android-chrome-192x192.png', 192], ['android-chrome-512x512.png', 512],
];
export async function faviconFiles(file, { pad = 0, background = null, apple = '#ffffff', name = 'My site', short = '', theme = '#ffffff' } = {}) {
  const c = await core.decode(file, { svgSize: 1024 });
  const files = [];
  const ico = await core.encodeICO(core.square(c, 256, { pad, background }), [16, 32, 48]);
  files.push(new File([ico], 'favicon.ico', { type: 'image/x-icon' }));
  for (const [n, s, kind] of FAVICONS) {
    const sq = core.square(c, s, { pad: kind === 'apple' ? Math.max(pad, 0.08) : pad, background: kind === 'apple' ? apple : background });
    files.push(new File([await core.encode(sq, 'image/png')], n, { type: 'image/png' }));
  }
  if (core.typeOf(file) === 'image/svg+xml') files.push(new File([file], 'favicon.svg', { type: 'image/svg+xml' }));
  files.push(new File([manifest({ name, short, theme })], 'site.webmanifest', { type: 'application/manifest+json' }));
  return files;
}
function manifest({ name, short, theme }) {
  return JSON.stringify({
    name, short_name: short || name,
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: theme, background_color: theme, display: 'standalone',
  }, null, 2);
}
const faviconHtml = (svg, theme) => [
  '<link rel="icon" href="/favicon.ico" sizes="48x48">',
  svg && '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
  `<meta name="theme-color" content="${theme}">`,
].filter(Boolean).join('\n');

// =====================================================================================
// 1. Image Atlas
// =====================================================================================
const FORMAT_NAMES = { jpeg: 'JPEG photo', png: 'PNG', webp: 'WebP', gif: 'GIF', avif: 'AVIF', heic: 'HEIC (iPhone photo)', bmp: 'BMP', tiff: 'TIFF', svg: 'SVG (vector drawing)', unknown: 'Unknown' };

function drawHistogram(cv, hist) {
  const W = cv.width = 512, H = cv.height = 160;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, W, H);
  const all = [...hist.r, ...hist.g, ...hist.b].sort((a, b) => a - b);
  const top = Math.max(1, all[Math.floor(all.length * 0.995)]);
  const draw = (arr, colour) => {
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i < 256; i++) x.lineTo(i * 2, H - Math.min(1, arr[i] / top) * (H - 4));
    x.lineTo(W, H); x.closePath(); x.fillStyle = colour; x.fill();
  };
  draw(hist.r, 'rgba(230, 70, 60, .5)'); draw(hist.g, 'rgba(70, 180, 90, .5)'); draw(hist.b, 'rgba(70, 120, 230, .5)');
}

const atlas = {
  id: 'img-atlas', name: 'Image Atlas', group: G, icon: 'file-scan', atlas: true,
  desc: 'Everything about one picture: size, colours, camera details, location and more.',
  keywords: 'image info inspect exif metadata gps location camera lens dimensions histogram colours palette details atlas',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    const err = note();
    const drop = imgDrop(f => load(f[0]));
    const out = h('div', { class: 'stack', hidden: true });
    root.append(card(drop, err.el), out);

    async function load(file) {
      err.clear();
      out.hidden = true;
      let c, bytes;
      try { [c, bytes] = await Promise.all([core.decode(file), bytesOf(file)]); }
      catch (e) { err.error(e.message); return; }
      const info = meta.inspect(bytes);
      const alpha = core.hasAlpha(c);
      const mp = c.width * c.height / 1e6;
      const payload = { files: [file] };

      const facts = h('dl', { class: 'kv img-facts' },
        h('dt', {}, 'Name'), h('dd', {}, file.name),
        h('dt', {}, 'Type'), h('dd', {}, FORMAT_NAMES[info.format] + (file.type ? ` (${file.type})` : '')),
        h('dt', {}, 'File size'), h('dd', {}, `${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)`),
        h('dt', {}, 'Dimensions'), h('dd', { class: 'img-dims' }, `${dims(c)} px`),
        h('dt', {}, 'Aspect ratio'), h('dd', { class: 'img-ratio' }, core.ratio(c.width, c.height)),
        h('dt', {}, 'Megapixels'), h('dd', {}, `${mp < 0.1 ? mp.toFixed(3) : mp.toFixed(1)} MP`),
        h('dt', {}, 'Transparency'), h('dd', { class: 'img-alpha' }, alpha ? 'Yes — has see-through pixels' : 'No'),
        h('dt', {}, 'Colour profile'), h('dd', {}, info.blocks.some(x => x.kind === 'icc') ? 'Embedded' : 'None (treated as sRGB)'),
        file.lastModified && h('dt', {}, 'File date'), file.lastModified && h('dd', {}, new Date(file.lastModified).toLocaleString()));

      // Camera and location
      const cam = meta.summary(info.tags);
      const camCard = card(h('h3', {}, 'Camera'),
        cam.length ? h('dl', { class: 'kv img-camera' }, cam.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))
          : h('p', { class: 'field-hint' }, 'No camera details in this file.'),
        info.text.length ? h('dl', { class: 'kv' }, info.text.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null);
      let gpsCard = null;
      if (info.gps) {
        const { lat, lon, alt } = info.gps;
        const osm = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=16/${lat.toFixed(5)}/${lon.toFixed(5)}`;
        gpsCard = card(h('h3', {}, 'Location'),
          h('div', { class: 'verdict bad img-gps' }, 'This picture says where it was taken'),
          h('dl', { class: 'kv' },
            h('dt', {}, 'Latitude'), h('dd', { class: 'img-lat' }, lat.toFixed(6)),
            h('dt', {}, 'Longitude'), h('dd', { class: 'img-lon' }, lon.toFixed(6)),
            alt != null && h('dt', {}, 'Altitude'), alt != null && h('dd', {}, `${Math.round(alt)} m`)),
          row(h('a', { class: 'btn small', href: osm, target: '_blank', rel: 'noopener noreferrer' }, icon('map-pin', 16), ' Open in OpenStreetMap'),
            h('button', { class: 'btn small primary', type: 'button', onclick: () => sendTo('img-strip', payload) }, 'Remove it')),
          h('p', { class: 'field-hint' }, 'The map link is only a link — nothing is looked up unless you open it.'));
      }
      const blocks = info.blocks.filter(x => x.kind !== 'keep');
      const metaCard = card(h('h3', {}, 'Hidden data in the file'),
        blocks.length ? h('ul', { class: 'tips' }, blocks.map(x => h('li', {}, x.name + (x.size ? ` — ${fmtBytes(x.size)}` : ''))))
          : h('p', { class: 'field-hint' }, 'None found — the file holds just the picture.'));

      // Colours
      const pal = core.dominant(c, 6);
      let picked = pal[0]?.hex || null;
      const pickedOut = output('Colour');
      pickedOut.set(picked || '');
      const sw = h('div', { class: 'img-swatches' }, pal.map(p => h('button', {
        type: 'button', class: 'img-swatch', style: `--c: ${p.hex}`, 'data-hex': p.hex, title: p.hex,
        onclick: e => { picked = p.hex; pickedOut.set(p.hex); sw.querySelectorAll('.img-swatch').forEach(s => s.classList.toggle('on', s === e.currentTarget)); },
      }, h('i'), h('span', {}, p.hex), h('small', {}, Math.round(p.share * 100) + '%'))));
      sw.firstChild?.classList.add('on');
      const hist = h('canvas', { class: 'img-hist', 'aria-label': 'Red, green and blue histogram' });
      drawHistogram(hist, core.histogram(c));

      const others = hub.tools.filter(t => t.group === G && t.id !== atlas.id && t.id !== 'img-paste' && accepts(t, payload));
      const quick = h('div', { class: 'chips' }, others.map(t => h('button', { type: 'button', class: 'chip', onclick: () => sendTo(t.id, payload) }, t.name)));

      out.replaceChildren(...[
        grid(card(h('div', { class: 'preview img-checker img-atlas-preview' }, h('img', { src: b.url(file), alt: file.name }))), card(h('h3', {}, 'The file'), facts)),
        grid(camCard, gpsCard || metaCard),
        gpsCard ? metaCard : null,
        grid(
          card(h('h3', {}, 'Main colours'), sw, pickedOut.el, row(sendBtn(() => picked ? { colour: picked } : null, 'Send colour to…'))),
          card(h('h3', {}, 'Histogram'), hist, h('p', { class: 'field-hint' }, 'How much of the picture sits at each brightness, per colour. Bunched at the left = dark; at the right = bright.'))),
        card(h('h3', {}, 'Do something with it'), quick, row(sendBtn(() => payload, 'Other tools…')))].filter(Boolean));
      out.hidden = false;
    }
    if (incoming?.files?.[0]) load(incoming.files[0]);
    return () => b.done();
  },
};

// =====================================================================================
// 2. Compress
// =====================================================================================
const compress = {
  id: 'img-compress', name: 'Compress image', group: G, icon: 'shrink',
  desc: 'Make a picture smaller in bytes, and compare before and after.',
  keywords: 'compress image optimise optimize reduce size smaller jpeg webp avif png tinypng quality kb',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    let src = null, file = null, result = null, run = 0, types = [];
    const err = note(), info = note();
    const drop = imgDrop(f => load(f[0]));
    const fmt = select([['image/jpeg', 'JPEG']], 'image/jpeg');
    const q = range(5, 100, 75);
    const qLabel = h('span', { class: 'img-range-val' }, '75');
    const qField = h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, 'Quality'), qLabel), q);
    const colours = select([['256', '256 colours'], ['128', '128 colours'], ['64', '64 colours'], ['32', '32 colours'], ['16', '16 colours']], '256');
    const colField = field('Colours', colours, 'Fewer colours = smaller file. Photos look banded below 256.');
    const max = select([['0', 'Keep size'], ['3840', '3840 px (4K)'], ['2560', '2560 px'], ['1920', '1920 px'], ['1280', '1280 px'], ['800', '800 px']], '0');
    const verdict = h('div', { class: 'verdict img-verdict' });
    const after = h('img', { alt: 'After' }), before = h('img', { alt: 'Before' });
    const split = range(0, 100, 50);
    const slider = h('div', { class: 'img-compare img-checker' }, before, h('div', { class: 'img-compare-after' }, after), h('div', { class: 'img-compare-line' }), split);
    const before2 = h('img', { alt: 'Before' }), after2 = h('img', { alt: 'After' });
    const side = h('div', { class: 'grid2', hidden: true },
      h('figure', { class: 'img-fig' }, h('div', { class: 'preview img-checker' }, before2), h('figcaption', {}, 'Before')),
      h('figure', { class: 'img-fig' }, h('div', { class: 'preview img-checker' }, after2), h('figcaption', { class: 'img-after-cap' }, 'After')));
    const view = tabs([['slider', 'Slider'], ['side', 'Side by side']], 'slider', v => { slider.hidden = v !== 'slider'; side.hidden = v !== 'side'; });
    const setSplit = () => slider.style.setProperty('--split', split.value + '%');
    split.addEventListener('input', setSplit); setSplit();
    const saveRow = row(downloadBtn(() => result?.name, () => result), sendBtn(() => result ? { files: [result] } : null));
    const outCard = card(verdict, view, slider, side, info.el, saveRow);
    outCard.hidden = true;
    root.append(card(drop, err.el),
      card(row(field('Save as', fmt), field('Longest side', max)), qField, colField), outCard);

    const typesReady = fmtType().then(list => {
      types = list;
      fmt.replaceChildren(...list.map(([v, l]) => h('option', { value: v }, l)));
    });
    function pickDefault() {
      const t = core.typeOf(file);
      fmt.value = types.some(x => x[0] === t) ? t : core.hasAlpha(src) ? 'image/png' : 'image/jpeg';
      sync();
    }
    function sync() {
      const lossy = core.lossy(fmt.value);
      qField.hidden = !lossy; colField.hidden = lossy;
      qLabel.textContent = q.value;
    }
    async function load(f) {
      err.clear();
      try { src = await core.decode(f); } catch (e) { err.error(e.message); return; }
      file = f;
      before.src = before2.src = b.url(f);
      await typesReady;
      pickDefault();
      go();
    }
    async function go() {
      if (!src) return;
      sync();
      const my = ++run;
      let c = +max.value ? core.fitMax(src, +max.value) : src;
      const type = fmt.value;
      const blob = await core.encode(c, type, q.value / 100, { colours: type === 'image/png' ? +colours.value : 0 });
      if (my !== run) return;
      result = new File([blob], rename(file.name, core.extOf(type), '-small'), { type });
      after.src = after2.src = b.url(blob);
      const smaller = blob.size < file.size;
      verdict.className = 'verdict img-verdict ' + (smaller ? 'good' : 'bad');
      verdict.textContent = sizeChange(file.size, blob.size);
      outCard.dataset.size = blob.size; outCard.dataset.type = type;
      info.info(`${labelOf(type)} · ${dims(c)} px` + (smaller ? '' : ' — this is bigger than the original. Try a lower quality, fewer colours, or keep the original.'));
      outCard.hidden = false;
    }
    on([fmt, max, colours], go, 'change');
    on(q, go, 'input', 200);
    if (incoming?.files?.[0]) load(incoming.files[0]);
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 3. Convert
// =====================================================================================
const CONVERT_TO = [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP'], ['image/avif', 'AVIF'], ['image/gif', 'GIF'], ['image/bmp', 'BMP'], ['image/x-icon', 'ICO (Windows icon)'], ['image/icns', 'ICNS (Mac icon)']];
const convert = {
  id: 'img-convert', name: 'Convert image', group: G, icon: 'refresh-cw',
  desc: 'Change pictures to PNG, JPEG, WebP, AVIF, GIF, BMP, ICO or ICNS — many at once.',
  keywords: 'convert image format png jpg jpeg webp avif gif bmp ico icns heic to batch change type',
  accepts: IMG,
  steps: [{
    id: 'img-convert', name: 'Convert format', accepts: IMG,
    options: [
      { key: 'format', label: 'Format', type: 'select', value: 'image/webp', choices: [['image/webp', 'WebP'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/avif', 'AVIF']] },
      { key: 'quality', label: 'Quality', type: 'range', value: 0.85, min: 0.1, max: 1, step: 0.01 },
    ],
    async run(files, o, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        ctx?.progress?.(i / files.length, f.name);
        out.push((await convertFile(f, o.format, +o.quality)).file);
      }
      return out;
    },
  }],
  render(root, incoming) {
    const b = bag();
    let files = [];
    const err = note(), fallback = note();
    const drop = imgDrop(f => { files = f; picked.textContent = `${f.length} picture${f.length === 1 ? '' : 's'} chosen`; go(); }, true);
    const picked = h('p', { class: 'field-hint' });
    const fmt = select(CONVERT_TO, 'image/webp');
    const q = range(10, 100, 85);
    const qLabel = h('span', { class: 'img-range-val' }, '85');
    const qField = h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, 'Quality'), qLabel), q);
    const max = numberIn('', 1, 20000);
    max.placeholder = 'Keep size';
    const bg = colourIn('#ffffff');
    const bgField = field('Fill for see-through areas', bg);
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => go() }, 'Convert');
    const prog = progress();
    const list = fileList(b, { zipName: 'converted.zip' });
    root.append(card(drop, picked, err.el),
      card(row(field('Convert to', fmt), field('Longest side (px, optional)', max)), qField, bgField, row(btn), prog.el, fallback.el),
      card(h('h3', {}, 'Results'), list.el));
    const sync = () => {
      qField.hidden = !core.lossy(fmt.value); qLabel.textContent = q.value;
      bgField.hidden = !['image/jpeg', 'image/bmp'].includes(fmt.value) && !(fmt.value === 'image/avif');
    };
    on([fmt, q], sync);
    on([fmt, bg], () => go(), 'change');
    on(q, () => go(), 'input', 400);
    on(max, () => go(), 'input', 500);
    Promise.all(['image/webp', 'image/avif'].map(core.canEncode)).then(([w, a]) => {
      for (const o of fmt.options) {
        if ((o.value === 'image/webp' && !w) || (o.value === 'image/avif' && !a)) o.textContent += ' — not in this browser';
      }
    });
    let run = 0;
    async function go() {
      if (!files.length) return;
      const my = ++run;
      err.clear(); fallback.clear();
      const items = [];
      for (const [i, f] of files.entries()) {
        prog.set(i / files.length); prog.label(`Converting ${f.name}…`);
        try {
          const r = await convertFile(f, fmt.value, q.value / 100, { max: +max.value || 0, background: bg.value });
          if (my !== run) return;
          if (r.note) fallback.info(r.note);
          items.push({ file: r.file, before: f.size, w: r.w, h: r.h });
        } catch (e) { err.error(e.message); }
      }
      prog.hide();
      list.set(items);
    }
    if (incoming?.files?.length) { files = incoming.files; picked.textContent = `${files.length} picture${files.length === 1 ? '' : 's'} chosen`; go(); }
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 4. Resize
// =====================================================================================
const resizeTool = {
  id: 'img-resize', name: 'Resize image', group: G, icon: 'scaling',
  desc: 'Make pictures smaller or bigger — by longest side, exact size or percent.',
  keywords: 'resize image scale shrink enlarge dimensions width height pixels percent batch smaller',
  accepts: IMG,
  steps: [{
    id: 'img-resize', name: 'Resize', accepts: IMG,
    options: [{ key: 'max', label: 'Longest side (px)', type: 'number', value: 1920, min: 16, max: 16000, step: 1, hint: 'Smaller pictures are left as they are.' }],
    async run(files, o, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        ctx?.progress?.(i / files.length, f.name);
        const c = await core.decode(f);
        const s = Math.min(1, +o.max / Math.max(c.width, c.height));
        if (s >= 1) { out.push(new File([f], f.name, { type: f.type })); continue; }
        const r = core.resize(c, c.width * s, c.height * s);
        const t = await sameType(f);
        out.push(new File([await core.encode(r, t, 0.9)], rename(f.name, core.extOf(t)), { type: t }));
      }
      return out;
    },
  }],
  render(root, incoming) {
    const b = bag();
    let files = [], first = null;
    const err = note();
    const picked = h('p', { class: 'field-hint' });
    async function take(f) {
      files = f; err.clear();
      try { first = await core.decode(f[0]); } catch (e) { err.error(e.message); return; }
      picked.textContent = `${f.length} picture${f.length === 1 ? '' : 's'} — the first is ${dims(first)} px`;
      if (!w.value) { w.value = first.width; hh.value = first.height; }
      go();
    }
    const drop = imgDrop(take, true);
    const mode = tabs([['long', 'Longest side'], ['exact', 'Exact size'], ['pct', 'Percent']], 'long', () => { sync(); go(); });
    const long = numberIn(1280, 1, 20000);
    const w = numberIn('', 1, 20000), hh = numberIn('', 1, 20000);
    const keep = checkbox('Keep the shape (fit inside this box)', true);
    const p = numberIn(50, 1, 1000);
    const noUp = checkbox('Never make a picture bigger', true);
    const paneLong = h('div', {}, field('Longest side (px)', long));
    const paneExact = h('div', { class: 'stack' }, row(field('Width (px)', w), field('Height (px)', hh)), keep);
    const panePct = h('div', {}, field('Percent of the original', p));
    const prog = progress();
    const list = fileList(b, { zipName: 'resized.zip' });
    root.append(card(drop, picked, err.el), card(mode, paneLong, paneExact, panePct, noUp, prog.el), card(h('h3', {}, 'Results'), list.el));
    function sync() { paneLong.hidden = mode.value !== 'long'; paneExact.hidden = mode.value !== 'exact'; panePct.hidden = mode.value !== 'pct'; }
    sync();
    function target(c) {
      let W = c.width, H = c.height;
      if (mode.value === 'long') { const s = (+long.value || W) / Math.max(W, H); W *= s; H *= s; }
      else if (mode.value === 'pct') { W *= (+p.value || 100) / 100; H *= (+p.value || 100) / 100; }
      else {
        const tw = +w.value || W, th = +hh.value || H;
        if (keep.input.checked) { const s = Math.min(tw / W, th / H); W *= s; H *= s; } else { W = tw; H = th; }
      }
      if (noUp.input.checked && (W > c.width || H > c.height)) { const s = Math.min(c.width / W, c.height / H); W *= s; H *= s; }
      return [Math.max(1, Math.round(W)), Math.max(1, Math.round(H))];
    }
    let run = 0;
    async function go() {
      if (!files.length) return;
      const my = ++run;
      const items = [];
      for (const [i, f] of files.entries()) {
        prog.set(i / files.length); prog.label(`Resizing ${f.name}…`);
        try {
          const r = await resizeFile(f, target);
          if (my !== run) return;
          items.push({ file: r.file, before: f.size, w: r.w, h: r.h });
        } catch (e) { err.error(e.message); }
      }
      prog.hide();
      list.set(items);
    }
    on([long, w, hh, p], go, 'input', 400);
    on([keep.input, noUp.input], go, 'change');
    if (incoming?.files?.length) take(incoming.files);
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 5. Social media cropper
// =====================================================================================
const SOCIAL = [
  ['ig-square', 'Instagram square', 1080, 1080],
  ['ig-portrait', 'Instagram portrait 4:5', 1080, 1350],
  ['story', 'Story / Reel 9:16', 1080, 1920],
  ['threads', 'Threads post 4:5', 1080, 1350],
  ['bsky-post', 'Bluesky post 16:9', 1600, 900],
  ['bsky-banner', 'Bluesky banner 3:1', 3000, 1000],
  ['x-post', 'X post 16:9', 1600, 900],
  ['x-header', 'X header 3:1', 1500, 500],
  ['yt-thumb', 'YouTube thumbnail', 1280, 720],
  ['li-post', 'LinkedIn post', 1200, 627],
  ['li-banner', 'LinkedIn banner', 1584, 396],
  ['og', 'Link preview (Open Graph)', 1200, 630],
  ['custom', 'Custom size', 0, 0],
];
const social = {
  id: 'img-social', name: 'Social media cropper', group: G, icon: 'crop',
  desc: 'Crop a picture to the exact size Instagram, X, YouTube, LinkedIn or Bluesky want.',
  keywords: 'crop social media instagram story reel square portrait x twitter header youtube thumbnail linkedin banner bluesky threads open graph',
  accepts: IMG,
  render(root, incoming) {
    let img = null, file = null, preset = SOCIAL[0];
    let zoom = 1, cx = 0, cy = 0;
    const err = note();
    const drop = imgDrop(f => load(f[0]));
    const chips = h('div', { class: 'chips img-presets' }, SOCIAL.map(p => h('button', {
      type: 'button', class: 'chip', 'data-id': p[0], onclick: () => pick(p),
    }, p[1], p[2] ? h('small', {}, ` ${p[2]}×${p[3]}`) : null)));
    const cw = numberIn(1200, 16, 8000), ch = numberIn(800, 16, 8000);
    const customRow = row(field('Width (px)', cw), field('Height (px)', ch));
    customRow.hidden = true;
    const cv = h('canvas', { class: 'img-crop-canvas' });
    const stage = h('div', { class: 'img-crop-stage img-checker' }, cv);
    const zoomIn = range(100, 500, 100);
    const fit = checkbox('Show the whole picture (adds a border)');
    const bg = colourIn('#ffffff');
    const fmt = select([['image/jpeg', 'JPEG'], ['image/png', 'PNG']], 'image/jpeg');
    const sizeNote = h('p', { class: 'field-hint img-crop-size' });
    const work = card(stage, h('p', { class: 'field-hint' }, 'Drag to move. Pinch, scroll or use the slider to zoom.'),
      field('Zoom', zoomIn), row(fit, field('Border colour', bg)), sizeNote,
      row(field('Save as', fmt)),
      row(downloadBtn(() => rename(file?.name || 'picture.png', core.extOf(fmt.value), '-' + preset[0]), () => exportBlob()),
        sendBtn(async () => img ? { files: [await asFile(await exportBlob(), rename(file.name, core.extOf(fmt.value), '-' + preset[0]), fmt.value)] } : null)));
    work.hidden = true;
    root.append(card(drop, err.el), card(h('span', { class: 'field-label' }, 'Size'), chips, customRow), work);

    const size = () => preset[0] === 'custom' ? [Math.max(16, +cw.value || 1200), Math.max(16, +ch.value || 800)] : [preset[2], preset[3]];
    const minZoom = () => { if (!fit.input.checked || !img) return 1; const [W, H] = size(); return Math.min(W / img.naturalWidth, H / img.naturalHeight) / cover(); };
    const cover = () => { const [W, H] = size(); return Math.max(W / img.naturalWidth, H / img.naturalHeight); };
    function clamp() {
      zoom = Math.max(minZoom(), Math.min(5, zoom));
      const [W, H] = size(), s = cover() * zoom;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const hw = W / 2 / s, hh = H / 2 / s;
      cx = hw * 2 >= iw ? iw / 2 : Math.max(hw, Math.min(iw - hw, cx));
      cy = hh * 2 >= ih ? ih / 2 : Math.max(hh, Math.min(ih - hh, cy));
    }
    function paint(target, guides) {
      const [W, H] = size();
      target.width = W; target.height = H;
      const x = target.getContext('2d');
      x.imageSmoothingQuality = 'high';
      if (fit.input.checked || fmt.value === 'image/jpeg') { x.fillStyle = bg.value; x.fillRect(0, 0, W, H); }
      const s = cover() * zoom;
      x.drawImage(img, W / 2 - cx * s, H / 2 - cy * s, img.naturalWidth * s, img.naturalHeight * s);
      if (guides) {
        x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = Math.max(1, W / 540);
        x.beginPath();
        for (const k of [1, 2]) { x.moveTo(W * k / 3, 0); x.lineTo(W * k / 3, H); x.moveTo(0, H * k / 3); x.lineTo(W, H * k / 3); }
        x.stroke();
      }
    }
    function draw() {
      if (!img) return;
      clamp();
      paint(cv, true);
      zoomIn.min = Math.round(minZoom() * 100);
      zoomIn.value = Math.round(zoom * 100);
      const [W, H] = size();
      stage.style.aspectRatio = `${W} / ${H}`;
      const srcW = W / (cover() * zoom);
      sizeNote.textContent = `${W} × ${H} px` + (srcW < W ? ` — the crop is ${Math.round(srcW)} px wide in your picture, so it will be stretched and may look soft.` : '');
    }
    async function exportBlob() {
      if (!img) return null;
      const c = core.canvas(1, 1);
      clamp(); paint(c, false);
      return core.encode(c, fmt.value, 0.92, { background: bg.value });
    }
    function pick(p) {
      preset = p;
      chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.id === p[0]));
      customRow.hidden = p[0] !== 'custom';
      zoom = 1; if (img) { cx = img.naturalWidth / 2; cy = img.naturalHeight / 2; }
      draw();
    }
    async function load(f) {
      err.clear();
      try { img = await loadImage(f); } catch { err.error(`Could not read ${f.name} as a picture.`); return; }
      file = f; work.hidden = false;
      pick(preset);
    }
    // Pointer drag and pinch
    const pts = new Map();
    let pinch = 0;
    const scaleCss = () => size()[0] / cv.clientWidth;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !img) return;
      const [px, py] = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const s = cover() * zoom, k = scaleCss();
        cx -= (e.clientX - px) * k / s; cy -= (e.clientY - py) * k / s;
      } else if (pts.size === 2) {
        const [a, c2] = [...pts.values()];
        const d = Math.hypot(a[0] - c2[0], a[1] - c2[1]);
        if (pinch) zoom *= d / pinch;
        pinch = d;
      }
      draw();
    });
    const up = e => { pts.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!img) return; e.preventDefault(); zoom *= Math.exp(-e.deltaY * 0.0015); draw(); }, { passive: false });
    zoomIn.addEventListener('input', () => { zoom = zoomIn.value / 100; draw(); });
    on([cw, ch], () => draw(), 'input', 200);
    on([fit.input, bg, fmt], () => draw(), 'change');
    bg.addEventListener('input', draw);
    chips.firstChild.classList.add('on');
    if (incoming?.files?.[0]) load(incoming.files[0]);
  },
};

// =====================================================================================
// 6. Strip metadata
// =====================================================================================
const stripTool = {
  id: 'img-strip', name: 'Strip metadata', group: G, icon: 'image-off',
  desc: 'See the hidden camera and location data in photos, then remove it.',
  keywords: 'strip remove metadata exif gps location privacy clean photo camera xmp iptc scrub',
  accepts: IMG,
  steps: [{
    id: 'img-strip', name: 'Remove metadata', accepts: IMG, options: [],
    async run(files, o, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) { ctx?.progress?.(i / files.length, f.name); out.push((await stripFile(f)).file); }
      return out;
    },
  }],
  render(root, incoming) {
    const b = bag();
    let files = [];
    const err = note();
    const drop = imgDrop(f => look(f), true);
    const found = h('div', { class: 'stack' });
    const btn = h('button', { class: 'btn primary', type: 'button', hidden: true, onclick: () => clean() }, 'Remove metadata');
    const list = fileList(b, { zipName: 'cleaned.zip' });
    const resCard = card(h('h3', {}, 'Cleaned'), list.el);
    resCard.hidden = true;
    root.append(card(drop, err.el), found, row(btn), resCard,
      h('p', { class: 'field-hint' }, 'JPEG, PNG, WebP and GIF are cleaned without re-compressing, so quality does not change. The colour profile and the rotation are kept. Other formats (HEIC, AVIF, BMP) are saved again as JPEG or PNG.'));
    async function look(list2) {
      files = list2; err.clear(); resCard.hidden = true;
      const cards = [];
      for (const f of files) {
        const info = meta.inspect(await bytesOf(f));
        const facts = meta.summary(info.tags);
        const blocks = info.blocks.filter(x => x.kind !== 'keep' && x.kind !== 'icc');
        cards.push(card(
          h('h3', {}, f.name),
          info.gps ? h('div', { class: 'verdict bad img-gps' }, `Location inside: ${info.gps.lat.toFixed(5)}, ${info.gps.lon.toFixed(5)}`) : null,
          facts.length ? h('dl', { class: 'kv' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])) : null,
          blocks.length ? h('ul', { class: 'tips' }, blocks.map(x => h('li', {}, x.name + (x.size ? ` — ${fmtBytes(x.size)}` : ''))))
            : h('p', { class: 'field-hint img-none' }, 'No hidden data found — already clean.')));
      }
      found.replaceChildren(...cards);
      btn.hidden = !files.length;
      btn.textContent = files.length > 1 ? `Remove metadata from ${files.length} pictures` : 'Remove metadata';
    }
    async function clean() {
      const items = [];
      for (const f of files) {
        try {
          const r = await stripFile(f);
          const left = meta.inspect(await bytesOf(r.file));
          const leftover = left.gps ? 'location still present!' : Object.keys(left.tags).filter(k => k !== 'Orientation').length ? 'some data left' : 'nothing left';
          items.push({ file: r.file, before: f.size, note: (r.reencoded ? 'Saved again as ' + labelOf(r.file.type) + '. ' : '') + 'Checked: ' + leftover });
        } catch (e) { err.error(e.message); }
      }
      await list.set(items);
      resCard.hidden = false;
      resCard.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
    if (incoming?.files?.length) look(incoming.files);
    return () => b.done();
  },
};

// =====================================================================================
// 7. Favicon generator
// =====================================================================================
const favicon = {
  id: 'img-favicon', name: 'Favicon generator', group: G, icon: 'app-window',
  desc: 'Every icon a website needs from one picture — favicon.ico, Apple and Android sizes, and the HTML.',
  keywords: 'favicon ico icon website apple touch android chrome manifest webmanifest pwa link tag',
  accepts: IMG,
  steps: [{
    id: 'img-favicon', name: 'Make favicons', accepts: IMG, options: [],
    async run(files, o, ctx) {
      ctx?.progress?.(0, files[0].name);
      return faviconFiles(files[0], o);
    },
  }],
  render(root, incoming) {
    const b = bag();
    let file = null, made = [];
    const err = note();
    const drop = imgDrop(f => { file = f[0]; go(); }, false, 'Drop a logo or picture (square works best, SVG is ideal)');
    const pad = range(0, 25, 0);
    const clear = checkbox('See-through background', true);
    const bg = colourIn('#ffffff');
    const apple = colourIn('#ffffff');
    const name = input({ value: 'My site' }), theme = colourIn('#ffffff');
    const tab = h('div', { class: 'img-fav-tab' });
    const grid2 = h('div', { class: 'img-fav-grid' });
    const html = output('Paste into <head>', { multiline: true, rows: 7 });
    const man = output('site.webmanifest', { multiline: true, rows: 8 });
    const save = row(
      h('button', { class: 'btn primary', type: 'button', onclick: async () => made.length && download('favicons.zip', await zip(made)) }, icon('file-archive', 16), ' Download all (.zip)'),
      sendBtn(() => made.length ? { files: made.filter(f => f.type.startsWith('image/')) } : null));
    const out = h('div', { class: 'stack', hidden: true }, card(h('h3', {}, 'Preview'), tab, grid2, save), grid(card(html.el), card(man.el)));
    root.append(card(drop, err.el),
      card(field('Padding', pad), row(clear, field('Background', bg)), field('Apple icon background', apple, 'iPhones fill see-through areas with black, so this one gets a solid colour.'),
        row(field('Site name', name), field('Theme colour', theme))),
      out);
    let run = 0;
    async function go() {
      if (!file) return;
      const my = ++run;
      err.clear();
      try {
        const files = await faviconFiles(file, { pad: pad.value / 100, background: clear.input.checked ? null : bg.value, apple: apple.value, name: name.value || 'My site', theme: theme.value });
        if (my !== run) return;
        made = files;
      } catch (e) { err.error(e.message); return; }
      const png = made.filter(f => f.type === 'image/png');
      const u32 = b.url(png.find(f => f.name === 'favicon-32x32.png'));
      tab.replaceChildren(h('span', { class: 'img-fav-tabbar' }, h('img', { src: u32, width: 16, height: 16, alt: '' }), h('span', {}, name.value || 'My site')));
      grid2.replaceChildren(...made.filter(f => f.type.startsWith('image/')).map(f => {
        const s = +(f.name.match(/(\d+)x\1/)?.[1] || (f.name.includes('apple') ? 180 : 48));
        return h('figure', { class: 'img-fav', 'data-name': f.name },
          h('div', { class: 'img-checker' }, h('img', { src: b.url(f), alt: f.name, style: { width: Math.min(s, 128) + 'px', height: Math.min(s, 128) + 'px' } })),
          h('figcaption', {}, f.name, h('small', {}, ` ${fmtBytes(f.size)}`)));
      }));
      html.set(faviconHtml(made.some(f => f.name === 'favicon.svg'), theme.value));
      man.set(await made.find(f => f.name === 'site.webmanifest').text());
      out.hidden = false;
      out.dataset.count = made.length;
    }
    on([pad, name], go, 'input', 250);
    on([clear.input, bg, apple, theme], go, 'change');
    if (incoming?.files?.[0]) { file = incoming.files[0]; go(); }
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 8. Image clipper
// =====================================================================================
const clipper = {
  id: 'img-trim', name: 'Image clipper', group: G, icon: 'square-dashed',
  desc: 'Cut away empty edges — see-through or plain colour — down to the smallest box.',
  keywords: 'trim crop auto transparent edges whitespace border clip autocrop tight bounding box logo',
  accepts: IMG,
  steps: [{
    id: 'img-trim', name: 'Trim empty edges', accepts: IMG,
    options: [{ key: 'mode', label: 'Edges', type: 'select', value: 'auto', choices: [['auto', 'Work it out'], ['alpha', 'See-through'], ['colour', 'Plain colour']] }],
    async run(files, o, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) { ctx?.progress?.(i / files.length, f.name); out.push((await trimFile(f, { mode: o.mode || 'auto' })).file); }
      return out;
    },
  }],
  render(root, incoming) {
    const b = bag();
    let file = null, result = null;
    const err = note();
    const drop = imgDrop(f => { file = f[0]; go(); });
    const mode = tabs([['auto', 'Work it out'], ['alpha', 'See-through edges'], ['colour', 'Plain colour edges']], 'auto', () => go());
    const tol = range(0, 100, 10);
    const pad = numberIn(0, 0, 500);
    const say = h('div', { class: 'big-say img-trim-say' });
    const pv = h('div', { class: 'preview img-checker' });
    const outCard = card(say, pv, row(downloadBtn(() => result?.name, () => result), sendBtn(() => result ? { files: [result] } : null)));
    outCard.hidden = true;
    root.append(card(drop, err.el), card(mode, row(field('Tolerance', tol, 'Higher = also cut nearly-matching pixels (soft shadows, JPEG noise).'), field('Keep a margin (px)', pad))), outCard);
    let run = 0;
    async function go() {
      if (!file) return;
      const my = ++run;
      err.clear();
      let r;
      try { r = await trimFile(file, { mode: mode.value, tolerance: +tol.value, pad: Math.max(0, +pad.value || 0) }); } catch (e) { err.error(e.message); return; }
      if (my !== run) return;
      outCard.hidden = false;
      if (!r.box) { say.textContent = 'The whole picture is background — nothing to keep.'; pv.replaceChildren(); result = null; return; }
      result = r.file;
      const same = r.box.w === r.from.width && r.box.h === r.from.height;
      say.textContent = same ? `Nothing to trim — ${r.w} × ${r.h}` : `${dims(r.from)} → ${r.w} × ${r.h}`;
      say.dataset.w = r.w; say.dataset.h = r.h;
      pv.replaceChildren(h('img', { src: b.url(result), alt: 'Trimmed picture' }));
    }
    on(tol, go, 'input', 200);
    on(pad, go, 'input', 300);
    if (incoming?.files?.[0]) { file = incoming.files[0]; go(); }
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 9. Image splitter
// =====================================================================================
const splitter = {
  id: 'img-split', name: 'Image splitter', group: G, icon: 'grid-3x3',
  desc: 'Cut a picture into a grid of tiles — for Instagram grids, carousels or print.',
  keywords: 'split image grid tiles slice cut pieces instagram carousel panorama puzzle rows columns',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    let src = null, file = null;
    const err = note();
    const drop = imgDrop(async f => { try { src = await core.decode(f[0]); file = f[0]; go(); } catch (e) { err.error(e.message); } });
    const rows = numberIn(1, 1, 20), cols = numberIn(3, 1, 20);
    const presets = h('div', { class: 'chips' }, [[1, 2, 'Carousel of 2'], [1, 3, 'Carousel of 3'], [3, 3, '3 × 3 grid'], [2, 2, '2 × 2'], [2, 3, '2 rows × 3']].map(([r, c, l]) =>
      h('button', { type: 'button', class: 'chip', onclick: () => { rows.value = r; cols.value = c; go(); } }, l)));
    const fmt = select([['same', 'Same as the original'], ['image/png', 'PNG'], ['image/jpeg', 'JPEG']], 'same');
    const cv = h('canvas', { class: 'img-split-canvas' });
    const say = h('p', { class: 'field-hint img-split-say' });
    const list = fileList(b, { zipName: 'tiles.zip' });
    const outCard = card(cv, say, list.el);
    outCard.hidden = true;
    root.append(card(drop, err.el), card(presets, row(field('Rows', rows), field('Columns', cols), field('Save as', fmt))), outCard);
    const edges = (n, size) => Array.from({ length: n + 1 }, (_, i) => Math.round(i * size / n));
    let run = 0;
    async function go() {
      if (!src) return;
      const my = ++run;
      const R = Math.max(1, Math.min(20, +rows.value || 1)), C = Math.max(1, Math.min(20, +cols.value || 1));
      const xs = edges(C, src.width), ys = edges(R, src.height);
      // Preview with cut lines
      const s = Math.min(1, 900 / src.width);
      cv.width = Math.round(src.width * s); cv.height = Math.round(src.height * s);
      const x = cv.getContext('2d');
      x.drawImage(src, 0, 0, cv.width, cv.height);
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([8, 6]);
      x.beginPath();
      for (const e of xs.slice(1, -1)) { x.moveTo(e * s, 0); x.lineTo(e * s, cv.height); }
      for (const e of ys.slice(1, -1)) { x.moveTo(0, e * s); x.lineTo(cv.width, e * s); }
      x.stroke();
      const type = fmt.value === 'same' ? await sameType(file) : fmt.value;
      const items = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const tile = core.crop(src, { x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
        const blob = await core.encode(tile, type, 0.92);
        items.push({ file: new File([blob], rename(file.name, core.extOf(type), `_r${r + 1}_c${c + 1}`), { type }), w: tile.width, h: tile.height });
      }
      if (my !== run) return;
      say.textContent = `${items.length} tiles, about ${items[0].w} × ${items[0].h} px each. Post them in reverse order on Instagram so the grid lines up.`;
      outCard.hidden = false;
      list.set(items);
    }
    on([rows, cols], go, 'input', 300);
    on(fmt, go, 'change');
    if (incoming?.files?.[0]) core.decode(incoming.files[0]).then(c => { src = c; file = incoming.files[0]; go(); }, e => err.error(e.message));
    return () => { run++; b.done(); };
  },
};

// =====================================================================================
// 10. Image stitcher
// =====================================================================================
const stitcher = {
  id: 'img-stitch', name: 'Image stitcher', group: G, icon: 'layout-grid',
  desc: 'Join pictures side by side, stacked, or in a grid — with a gap and background.',
  keywords: 'stitch combine merge join images side by side collage grid stack vertical horizontal before after',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    let items = []; // { file, c }
    let result = null;
    const err = note();
    const drop = imgDrop(add, true, 'Drop pictures here, or tap to choose (add more any time)');
    const listEl = h('div', { class: 'img-stitch-list' });
    const dir = tabs([['h', 'Side by side'], ['v', 'Stacked'], ['grid', 'Grid']], 'h', () => { colsF.hidden = dir.value !== 'grid'; go(); });
    const cols = numberIn(2, 1, 20);
    const colsF = field('Columns', cols); colsF.hidden = true;
    const gap = numberIn(0, 0, 500);
    const match = checkbox('Make them the same size', true);
    const clear = checkbox('See-through background', false);
    const bg = colourIn('#ffffff');
    const fmt = select([['image/png', 'PNG'], ['image/jpeg', 'JPEG']], 'image/png');
    const cv = h('canvas', { class: 'img-stitch-canvas' });
    const say = h('p', { class: 'field-hint img-stitch-say' });
    const outCard = card(h('div', { class: 'preview img-checker' }, cv), say,
      row(field('Save as', fmt)),
      row(downloadBtn(() => 'stitched.' + core.extOf(fmt.value), async () => result && core.encode(result, fmt.value, 0.92, { background: bg.value })),
        sendBtn(async () => result ? { files: [await asFile(await core.encode(result, fmt.value, 0.92, { background: bg.value }), 'stitched.' + core.extOf(fmt.value), fmt.value)] } : null)));
    outCard.hidden = true;
    root.append(card(drop, err.el, listEl), card(dir, row(colsF, field('Gap (px)', gap)), row(match, clear, field('Background', bg))), outCard);

    async function add(files) {
      for (const f of files) {
        try { items.push({ file: f, c: await core.decode(f) }); } catch (e) { err.error(e.message); }
      }
      showList(); go();
    }
    function showList() {
      listEl.replaceChildren(...items.map((it, i) => h('div', { class: 'img-stitch-item' },
        h('div', { class: 'img-thumb img-checker' }, h('img', { src: b.url(it.file), alt: '' })),
        h('span', {}, `${i + 1}. ${it.file.name}`),
        h('span', { class: 'row tight' },
          h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; showList(); go(); } }, '↑'),
          h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; showList(); go(); } }, '↓'),
          h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove', onclick: () => { items.splice(i, 1); showList(); go(); } }, icon('x', 16))))));
    }
    function go() {
      if (!items.length) { outCard.hidden = true; result = null; return; }
      const G2 = Math.max(0, +gap.value || 0), m = match.input.checked;
      const cs = items.map(i => i.c);
      let boxes = [], W = 0, H = 0;
      if (dir.value === 'h') {
        const th = m ? Math.min(...cs.map(c => c.height)) : 0;
        let x = 0;
        for (const c of cs) { const w = m ? c.width * th / c.height : c.width, hh = m ? th : c.height; boxes.push([x, 0, w, hh]); x += w + G2; }
        W = x - G2; H = Math.max(...boxes.map(bx => bx[3]));
        boxes = boxes.map(bx => [bx[0], (H - bx[3]) / 2, bx[2], bx[3]]);
      } else if (dir.value === 'v') {
        const tw = m ? Math.min(...cs.map(c => c.width)) : 0;
        let y = 0;
        for (const c of cs) { const w = m ? tw : c.width, hh = m ? c.height * tw / c.width : c.height; boxes.push([0, y, w, hh]); y += hh + G2; }
        H = y - G2; W = Math.max(...boxes.map(bx => bx[2]));
        boxes = boxes.map(bx => [(W - bx[2]) / 2, bx[1], bx[2], bx[3]]);
      } else {
        const C = Math.max(1, Math.min(20, +cols.value || 2)), R = Math.ceil(cs.length / C);
        const cw = m ? Math.min(...cs.map(c => c.width)) : Math.max(...cs.map(c => c.width));
        const ch = m ? Math.min(...cs.map(c => c.height)) : Math.max(...cs.map(c => c.height));
        cs.forEach((c, i) => {
          const s = m ? Math.min(cw / c.width, ch / c.height) : 1;
          const w = c.width * s, hh = c.height * s;
          const cx = (i % C) * (cw + G2), cy = Math.floor(i / C) * (ch + G2);
          boxes.push([cx + (cw - w) / 2, cy + (ch - hh) / 2, w, hh]);
        });
        W = C * cw + (C - 1) * G2; H = R * ch + (R - 1) * G2;
      }
      W = Math.round(W); H = Math.round(H);
      if (W * H > 268e6) { err.error('That would be too big for the browser to draw. Turn on "same size" or use smaller pictures.'); return; }
      result = core.canvas(W, H);
      const x = result.getContext('2d');
      x.imageSmoothingQuality = 'high';
      if (!clear.input.checked) { x.fillStyle = bg.value; x.fillRect(0, 0, W, H); }
      cs.forEach((c, i) => { const [bx, by, bw, bh] = boxes[i]; x.drawImage(bw < c.width ? core.resize(c, bw, bh) : c, Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh)); });
      cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(result, 0, 0);
      say.textContent = `${W} × ${H} px from ${cs.length} picture${cs.length === 1 ? '' : 's'}`;
      say.dataset.w = W; say.dataset.h = H;
      outCard.hidden = false;
    }
    on([gap, cols], go, 'input', 250);
    on([match.input, clear.input, bg], go, 'change');
    if (incoming?.files?.length) add(incoming.files);
    return () => b.done();
  },
};

// =====================================================================================
// 11. SVG optimiser
// =====================================================================================
const svgOpt = {
  id: 'svg-optimise', name: 'SVG optimiser', group: G, icon: 'vector-square',
  desc: 'Make SVG files smaller by removing editor junk and tidying numbers.',
  keywords: 'svg optimise optimize minify svgo compress vector clean inkscape illustrator figma smaller',
  accepts: ['image/svg+xml', '.svg'],
  render(root, incoming) {
    const b = bag();
    let svgo = null, name = 'image.svg', result = '';
    const err = note();
    const drop = dropzone({ accept: '.svg,image/svg+xml', label: 'Drop an SVG file here, or tap to choose one', onfiles: async f => { name = f[0].name; src.value = await f[0].text(); go(); } });
    const src = textarea({ rows: 6, placeholder: 'Or paste SVG code here' });
    const multi = checkbox('Several passes (a little smaller, a little slower)', true);
    const prec = select([['1', '1 decimal'], ['2', '2 decimals'], ['3', '3 decimals'], ['4', '4 decimals']], '3');
    const dimsBox = checkbox('Remove width and height (scales to fit its box)', false);
    const verdict = h('div', { class: 'verdict img-verdict' });
    const out = output('Optimised SVG', { multiline: true, rows: 8 });
    const pb = h('div', { class: 'preview img-checker img-svg-pv' }), pa = h('div', { class: 'preview img-checker img-svg-pv' });
    const outCard = card(verdict,
      grid(h('figure', { class: 'img-fig' }, pb, h('figcaption', {}, 'Before')), h('figure', { class: 'img-fig' }, pa, h('figcaption', {}, 'After'))),
      out.el,
      row(downloadBtn(() => rename(name, 'svg', '.min'), () => result && new Blob([result], { type: 'image/svg+xml' })),
        sendBtn(() => result ? { files: [new File([result], rename(name, 'svg', '.min'), { type: 'image/svg+xml' })] } : null)),
      h('p', { class: 'field-hint' }, 'Check the “After” preview — very low precision can bend fine curves.'));
    outCard.hidden = true;
    root.append(card(drop, field('SVG code', src), err.el), card(multi, row(field('Number precision', prec)), dimsBox), outCard);
    const ready = import('../../vendor/svgo.js').then(m => { svgo = m; }).catch(() => err.error('Could not load the SVG optimiser — are you offline on a first visit?'));
    const pv = (el, text) => el.replaceChildren(h('img', { src: b.url(new Blob([text], { type: 'image/svg+xml' })), alt: '' }));
    async function go() {
      const text = src.value.trim();
      if (!text) { outCard.hidden = true; return; }
      await ready;
      if (!svgo) return;
      err.clear();
      try {
        const plugins = [{ name: 'preset-default', params: { overrides: {} } }];
        if (dimsBox.input.checked) plugins.push('removeDimensions');
        result = svgo.optimize(text, { multipass: multi.input.checked, floatPrecision: +prec.value, plugins }).data;
      } catch (e) { err.error('That is not valid SVG: ' + String(e.message || e).split('\n')[0]); outCard.hidden = true; return; }
      const before = new Blob([text]).size, after = new Blob([result]).size;
      verdict.textContent = sizeChange(before, after);
      verdict.className = 'verdict img-verdict ' + (after < before ? 'good' : '');
      out.set(result);
      pv(pb, text); pv(pa, result);
      outCard.hidden = false;
    }
    on(src, go, 'input', 400);
    on([multi.input, prec, dimsBox.input], go, 'change');
    if (incoming?.files?.[0]) incoming.files[0].text().then(t => { name = incoming.files[0].name; src.value = t; go(); });
    return () => b.done();
  },
};

// =====================================================================================
// 12. Image to Base64
// =====================================================================================
const b64 = {
  id: 'img-base64', name: 'Image to Base64', group: G, icon: 'binary',
  desc: 'Turn a picture into a data URI for CSS or HTML — or a data URI back into a picture.',
  keywords: 'image base64 data uri url css background html img inline embed encode decode',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    let decoded = null;
    const mode = tabs([['enc', 'Picture → Base64'], ['dec', 'Base64 → picture']], 'enc', v => { encPane.hidden = v !== 'enc'; decPane.hidden = v !== 'dec'; });
    const err = note();
    const drop = imgDrop(f => enc(f[0]));
    const pv = h('div', { class: 'preview img-checker' });
    const say = h('p', { class: 'field-hint img-b64-say' });
    const uri = output('Data URI', { multiline: true, rows: 4 });
    const css = output('CSS', { multiline: true, rows: 3 });
    const tag = output('HTML', { multiline: true, rows: 3 });
    const raw = output('Base64 only', { multiline: true, rows: 3 });
    const encOut = h('div', { class: 'stack', hidden: true }, pv, say, uri.el, css.el, tag.el, raw.el);
    const encPane = card(drop, err.el, encOut);
    const src = textarea({ rows: 5, placeholder: 'Paste a data URI (data:image/png;base64,…) or plain Base64' });
    const err2 = note();
    const pv2 = h('div', { class: 'preview img-checker' });
    const say2 = h('p', { class: 'field-hint img-b64-dec' });
    const decSave = row(downloadBtn(() => decoded?.name, () => decoded), sendBtn(() => decoded ? { files: [decoded] } : null));
    decSave.hidden = true;
    const decPane = card(field('Base64', src), err2.el, pv2, say2, decSave);
    decPane.hidden = true;
    root.append(mode, encPane, decPane);
    const toB64 = async f => {
      const bytes = await bytesOf(f);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    async function enc(f) {
      err.clear();
      const type = core.typeOf(f) || 'application/octet-stream';
      const data = await toB64(f);
      const u = `data:${type};base64,${data}`;
      uri.set(u); raw.set(data);
      css.set(`background-image: url("${u}");`);
      let w = '', hh = '';
      try { const c = await core.decode(f); w = c.width; hh = c.height; } catch {}
      tag.set(`<img src="${u}" alt=""${w ? ` width="${w}" height="${hh}"` : ''}>`);
      pv.replaceChildren(h('img', { src: b.url(f), alt: f.name }));
      say.textContent = `${fmtBytes(f.size)} file → ${fmtBytes(u.length)} of text (Base64 is about a third bigger).` +
        (u.length > 100000 ? ' That is large to inline — a normal image file will load faster.' : '');
      encOut.hidden = false;
    }
    async function dec() {
      err2.clear(); decSave.hidden = true; pv2.replaceChildren(); say2.textContent = ''; decoded = null;
      let t = src.value.trim();
      if (!t) return;
      t = t.replace(/^url\(["']?|["']?\);?$/g, '');
      const m = t.match(/^data:([\w/+.-]+)?(;[^,]*)?,/);
      const body = (m ? t.slice(m[0].length) : t).replace(/\s+/g, '');
      let bytes;
      try { const bin = atob(body.replace(/-/g, '+').replace(/_/g, '/')); bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0)); }
      catch { err2.error('That is not valid Base64.'); return; }
      const fmt = meta.sniff(bytes);
      const type = m?.[1] || { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' }[fmt] || 'application/octet-stream';
      decoded = new File([bytes], 'decoded.' + (type === 'image/svg+xml' ? 'svg' : core.extOf(type)), { type });
      try {
        const c = await core.decode(decoded);
        pv2.replaceChildren(h('img', { src: b.url(decoded), alt: 'Decoded picture' }));
        say2.textContent = `${labelOf(type)} · ${dims(c)} px · ${fmtBytes(bytes.length)}`;
        decSave.hidden = false;
      } catch { err2.error(`Decoded ${fmtBytes(bytes.length)}, but it is not a picture this browser can show.`); decSave.hidden = false; }
    }
    on(src, dec, 'input', 300);
    if (incoming?.files?.[0]) enc(incoming.files[0]);
    return () => b.done();
  },
};

// =====================================================================================
// 13. Paste image
// =====================================================================================
const paste = {
  id: 'img-paste', name: 'Paste image', group: G, icon: 'clipboard-paste',
  desc: 'Paste a screenshot or copied picture, then save it or send it to another tool.',
  keywords: 'paste clipboard screenshot image save download png copy picture snip',
  accepts: IMG,
  render(root, incoming) {
    const b = bag();
    let file = null;
    const err = note();
    const canRead = !!navigator.clipboard?.read;
    const btn = h('button', { class: 'btn primary img-paste-btn', type: 'button', hidden: !canRead, onclick: readClip }, icon('clipboard-paste', 20), ' Paste');
    const hint = h('p', { class: 'field-hint' }, canRead ? 'Or press Ctrl+V / ⌘V anywhere on this page.' : 'Press Ctrl+V / ⌘V, or long-press and choose Paste on a phone.');
    const catcher = h('div', { class: 'img-paste-catch', contentEditable: 'true', 'aria-label': 'Paste here', spellcheck: false }, 'Tap here, then Paste');
    const pv = h('div', { class: 'preview img-checker' });
    const say = h('p', { class: 'field-hint img-paste-say' });
    const outCard = card(pv, say, row(
      downloadBtn(() => rename(file?.name || 'pasted.png', 'png'), async () => file && (file.type === 'image/png' ? file : core.encode(await core.decode(file), 'image/png')), 'Download PNG'),
      downloadBtn(() => rename(file?.name || 'pasted.png', 'jpg'), async () => file && core.encode(await core.decode(file), 'image/jpeg', 0.92), 'Download JPEG'),
      sendBtn(() => file ? { files: [file] } : null)));
    outCard.hidden = true;
    root.append(card(row(btn), hint, canRead ? null : catcher, err.el), outCard);
    async function show(f) {
      err.clear();
      let c;
      try { c = await core.decode(f); } catch (e) { err.error(e.message); return; }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      file = f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${stamp}.${core.extOf(f.type)}`, { type: f.type || 'image/png' });
      pv.replaceChildren(h('img', { src: b.url(file), alt: 'Pasted picture' }));
      say.textContent = `${dims(c)} px · ${fmtBytes(file.size)} · ${labelOf(file.type)}`;
      say.dataset.w = c.width; say.dataset.h = c.height;
      outCard.hidden = false;
    }
    async function readClip() {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find(x => x.startsWith('image/'));
          if (t) { show(new File([await it.getType(t)], 'image.png', { type: t })); return; }
        }
        err.error('There is no picture on the clipboard. Copy one (or take a screenshot to the clipboard) and try again.');
      } catch { err.error('The browser blocked reading the clipboard. Press Ctrl+V / ⌘V instead.'); }
    }
    // Catch pastes before the app does (it would reopen this tool with the same file).
    const onPaste = e => {
      const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
      if (!f) { if (e.target === catcher) { e.preventDefault(); err.error('That was not a picture.'); } return; }
      e.preventDefault(); e.stopPropagation();
      catcher.textContent = 'Tap here, then Paste';
      show(f);
    };
    document.addEventListener('paste', onPaste);
    if (incoming?.files?.[0]) show(incoming.files[0]);
    return () => { document.removeEventListener('paste', onPaste); b.done(); };
  },
};

export default [atlas, compress, convert, resizeTool, social, stripTool, favicon, clipper, splitter, stitcher, svgOpt, b64, paste];
