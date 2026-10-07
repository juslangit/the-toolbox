import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, copyBtn, download, copy } from '../ui.js';
import qrcode from '../../vendor/qrcode.js';

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

function qrMatrix(text, ecl) {
  const q = qrcode(0, ecl);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}
function qrSvg(m, fg, bg, margin = 4) {
  const size = m.n + margin * 2;
  let d = '';
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
const wifiEscape = s => s.replace(/([\\;,:"])/g, '\\$1');

const qr = {
  id: 'qr', name: 'QR code', group: 'everyday', icon: 'qr-code',
  desc: 'QR codes for links, text or WiFi logins — download as PNG or SVG.',
  keywords: 'qr code wifi barcode link share homestay password scan',
  render(root) {
    const mode = tabs([['text', 'Link or text'], ['wifi', 'WiFi']], 'text', v => { textPane.hidden = v !== 'text'; wifiPane.hidden = v !== 'wifi'; draw(); });
    const text = textarea({ rows: 3, value: 'https://juslangit.github.io', mono: false });
    const ssid = input({ placeholder: 'Network name' });
    const pass = input({ placeholder: 'Password' });
    const sec = select([['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'No password']], 'WPA');
    const hidden = checkbox('Hidden network');
    const fg = h('input', { type: 'color', class: 'swatch-input', value: '#1b1714', 'aria-label': 'Dots colour' });
    const bg = h('input', { type: 'color', class: 'swatch-input', value: '#ffffff', 'aria-label': 'Background colour' });
    const ecl = select([['L', 'Low (7%)'], ['M', 'Medium (15%)'], ['Q', 'High (25%)'], ['H', 'Highest (30%)']], 'M');
    const err = note();
    const canvas = h('canvas', { class: 'qr', width: 512, height: 512 });
    let svg = '';

    const textPane = h('div', {}, field('Link or text', text));
    const wifiPane = h('div', { hidden: true }, grid(field('Network name (SSID)', ssid), field('Password', pass)), row(field('Security', sec), hidden),
      h('p', { class: 'field-hint' }, 'Guests point their phone camera at it and join — no typing.'));

    function payload() {
      if (mode.value === 'text') return text.value;
      if (!ssid.value) return '';
      const p = sec.value === 'nopass' ? '' : `P:${wifiEscape(pass.value)};`;
      return `WIFI:T:${sec.value};S:${wifiEscape(ssid.value)};${p}${hidden.input.checked ? 'H:true;' : ''};`;
    }
    function draw() {
      const ctx = canvas.getContext('2d');
      const data = payload();
      ctx.fillStyle = bg.value; ctx.fillRect(0, 0, 512, 512);
      if (!data) { svg = ''; err.clear(); return; }
      try {
        const m = qrMatrix(data, ecl.value);
        const margin = 4, cell = 512 / (m.n + margin * 2);
        ctx.fillStyle = fg.value;
        for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++)
          if (m.dark(r, c)) ctx.fillRect(Math.floor((c + margin) * cell), Math.floor((r + margin) * cell), Math.ceil(cell), Math.ceil(cell));
        svg = qrSvg(m, fg.value, bg.value, margin);
        err.clear();
      } catch { svg = ''; err.error('Too much text for one QR code.'); }
    }
    root.append(
      h('div', { class: 'grid2 preview-first' },
        card(mode, textPane, wifiPane, row(field('Dots', fg), field('Background', bg), field('Error correction', ecl)), err.el),
        h('section', { class: 'card center' }, canvas, row(
          h('button', { class: 'btn primary', type: 'button', onclick: () => svg && download('qr.png', canvas.toDataURL('image/png')) }, 'PNG'),
          h('button', { class: 'btn', type: 'button', onclick: () => svg && download('qr.svg', new Blob([svg], { type: 'image/svg+xml' })) }, 'SVG'),
          h('button', { class: 'btn', type: 'button', onclick: () => svg && copy(svg) }, 'Copy SVG')))));
    on([text, ssid, pass, fg, bg, hidden.input], draw);
    on([sec, ecl], draw, 'change');
  },
};

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const pick = n => Math.floor(Math.random() * n);

const lorem = {
  id: 'lorem', name: 'Lorem ipsum', group: 'everyday', icon: 'pilcrow',
  desc: 'Filler text for mock-ups: paragraphs, sentences or words.',
  keywords: 'lorem ipsum placeholder dummy filler text',
  render(root) {
    const paras = input({ type: 'number', value: 3, min: 1, max: 50 });
    const sents = input({ type: 'number', value: 5, min: 1, max: 30 });
    const words = input({ type: 'number', value: 10, min: 3, max: 40 });
    const classic = checkbox('Start with “Lorem ipsum dolor sit amet”', true);
    const html = checkbox('Wrap in <p> tags');
    const out = output('Text', { multiline: true, rows: 12 });
    function gen() {
      const ps = [];
      for (let p = 0; p < Math.min(50, +paras.value || 1); p++) {
        const ss = [];
        for (let s = 0; s < Math.min(30, +sents.value || 1); s++) {
          const n = Math.max(3, (+words.value || 10) + pick(5) - 2);
          let w = Array.from({ length: n }, () => WORDS[pick(WORDS.length)]);
          if (p === 0 && s === 0 && classic.input.checked) w = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', ...w.slice(5)];
          const str = w.join(' ');
          ss.push(str[0].toUpperCase() + str.slice(1) + '.');
        }
        ps.push(ss.join(' '));
      }
      out.set(html.input.checked ? ps.map(p => `<p>${p}</p>`).join('\n') : ps.join('\n\n'));
    }
    root.append(card(grid(field('Paragraphs', paras), field('Sentences each', sents)), field('Words per sentence (about)', words),
      h('div', { class: 'checks' }, classic, html), row(h('button', { class: 'btn primary', type: 'button', onclick: gen }, 'New text'))), card(out.el));
    on([paras, sents, words, classic.input, html.input], gen);
  },
};

const stats = {
  id: 'stats', name: 'Text statistics', group: 'everyday', icon: 'letter-text',
  desc: 'Count words, characters, lines and bytes, with reading time.',
  keywords: 'word count character count length bytes reading time text',
  render(root) {
    const text = textarea({ rows: 10, mono: false, placeholder: 'Paste or type text…' });
    const grid4 = h('div', { class: 'stat-grid' });
    const top = h('div', { class: 'chips' });
    function run() {
      const t = text.value;
      const words = t.match(/[\p{L}\p{N}'’-]+/gu) || [];
      const s = [
        ['Words', words.length],
        ['Characters', [...t].length],
        ['Without spaces', [...t.replace(/\s/g, '')].length],
        ['Lines', t ? t.split('\n').length : 0],
        ['Sentences', (t.match(/[^.!?]+[.!?]+/g) || []).length || (t.trim() ? 1 : 0)],
        ['Paragraphs', t.split(/\n\s*\n/).filter(p => p.trim()).length],
        ['Bytes (UTF-8)', new TextEncoder().encode(t).length],
        ['Reading time', words.length ? `${Math.max(1, Math.round(words.length / 230))} min` : '0 min'],
      ];
      grid4.replaceChildren(...s.map(([k, v]) => h('div', { class: 'stat' }, h('strong', {}, typeof v === 'number' ? v.toLocaleString() : v), h('span', {}, k))));
      const freq = {};
      for (const w of words) { const k = w.toLowerCase(); if (k.length > 3) freq[k] = (freq[k] || 0) + 1; }
      top.replaceChildren(...Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => h('span', { class: 'pill' }, `${w} × ${n}`)));
    }
    root.append(card(field('Text', text)), card(grid4), card(h('h3', {}, 'Most used words (4+ letters)'), top));
    on(text, run);
  },
};

function wordsOf(s) {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/).filter(Boolean);
}
const cap = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
const CASES = [
  ['slug', 'Slug (for URLs)', w => w.join('-').toLowerCase()],
  ['camel', 'camelCase', w => w.map((x, i) => i ? cap(x) : x.toLowerCase()).join('')],
  ['pascal', 'PascalCase', w => w.map(cap).join('')],
  ['snake', 'snake_case', w => w.join('_').toLowerCase()],
  ['const', 'CONSTANT_CASE', w => w.join('_').toUpperCase()],
  ['kebab', 'kebab-case', w => w.join('-').toLowerCase()],
  ['dot', 'dot.case', w => w.join('.').toLowerCase()],
  ['title', 'Title Case', w => w.map(cap).join(' ')],
  ['sentence', 'Sentence case', w => { const s = w.join(' ').toLowerCase(); return s && s[0].toUpperCase() + s.slice(1); }],
];

const cases = {
  id: 'case', name: 'Case & slug', group: 'everyday', icon: 'case-sensitive',
  desc: 'Turn any phrase into a URL slug, camelCase, snake_case and more.',
  keywords: 'slugify slug case converter camel snake kebab pascal title upper lower',
  render(root) {
    const src = input({ value: 'Kasih Alza Homestay — Bilik Keluarga', placeholder: 'Any text' });
    const outs = CASES.map(([id, label, fn]) => ({ fn, o: output(label) }));
    const upper = output('UPPER'), lower = output('lower');
    function run() {
      const w = wordsOf(src.value);
      for (const { fn, o } of outs) o.set(w.length ? fn(w) : '');
      upper.set(src.value.toUpperCase()); lower.set(src.value.toLowerCase());
    }
    root.append(card(field('Text', src)), card(...outs.map(x => x.o.el), upper.el, lower.el));
    on(src, run);
  },
};

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const placeholder = {
  id: 'placeholder', name: 'Image placeholder', group: 'everyday', icon: 'image',
  desc: 'Sized placeholder images for mock-ups, as SVG, PNG or a data URL.',
  keywords: 'placeholder image svg dummy mockup size png data uri',
  render(root) {
    const w = input({ type: 'number', value: 1200, min: 1, max: 4000 });
    const hgt = input({ type: 'number', value: 630, min: 1, max: 4000 });
    const bg = h('input', { type: 'color', class: 'swatch-input', value: '#2a2420' });
    const fg = h('input', { type: 'color', class: 'swatch-input', value: '#e8a33d' });
    const label = input({ placeholder: 'Leave empty to show the size' });
    const preview = h('div', { class: 'preview checker' });
    const svgOut = output('SVG', { multiline: true, rows: 4 });
    const uri = output('Data URL (for src="…")', { multiline: true, rows: 3 });
    const sizes = [[1200, 630, 'Link preview'], [1080, 1080, 'Square post'], [1080, 1920, 'Story / Short'], [1920, 1080, 'Full HD'], [400, 300, 'Thumbnail']];
    let svg = '';
    function run() {
      const W = Math.max(1, Math.min(4000, +w.value || 1)), H = Math.max(1, Math.min(4000, +hgt.value || 1));
      const t = esc(label.value || `${W} × ${H}`);
      const fs = Math.max(10, Math.round(Math.min(W / Math.max(4, t.length) * 1.4, H / 4)));
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${bg.value}"/><text x="50%" y="50%" fill="${fg.value}" font-family="system-ui, sans-serif" font-size="${fs}" font-weight="600" text-anchor="middle" dominant-baseline="central">${t}</text></svg>`;
      svgOut.set(svg);
      uri.set('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      preview.innerHTML = svg;
    }
    function png() {
      const img = new Image();
      img.onload = () => {
        const c = h('canvas', { width: img.width, height: img.height });
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(b => download(`placeholder-${img.width}x${img.height}.png`, b));
      };
      img.src = uri.get();
    }
    root.append(
      card(grid(field('Width', w), field('Height', hgt)),
        h('div', { class: 'chips' }, sizes.map(([a, b, l]) => h('button', { class: 'chip', type: 'button', onclick: () => { w.value = a; hgt.value = b; run(); } }, `${l} · ${a}×${b}`))),
        row(field('Background', bg), field('Text colour', fg), field('Text', label))),
      card(preview, row(
        h('button', { class: 'btn primary', type: 'button', onclick: png }, 'PNG'),
        h('button', { class: 'btn', type: 'button', onclick: () => download('placeholder.svg', new Blob([svg], { type: 'image/svg+xml' })) }, 'SVG'))),
      card(svgOut.el, uri.el));
    on([w, hgt, bg, fg, label], run);
  },
};

export default [qr, lorem, stats, cases, placeholder];
