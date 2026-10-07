import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, copyBtn, download } from '../ui.js';
import yaml from '../../vendor/js-yaml.js';
import * as toml from '../../vendor/smol-toml.js';
import Papa from '../../vendor/papaparse.js';

// UTF-8 safe base64 (btoa alone breaks on anything outside Latin-1).
function b64encode(str, urlSafe) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  let s = btoa(bin);
  if (urlSafe) s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return s;
}
function b64bytes(s) {
  s = s.trim().replace(/^data:[^,]*,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

const base64 = {
  id: 'base64', name: 'Base64', group: 'convert', icon: 'binary',
  desc: 'Encode and decode Base64 text, or turn a file into a data URL and back.',
  keywords: 'encode decode b64 data url file image',
  render(root) {
    const mode = tabs([['text', 'Text'], ['file', 'File']], 'text', v => { textPane.hidden = v !== 'text'; filePane.hidden = v !== 'file'; });

    const plain = textarea({ placeholder: 'Plain text…', rows: 6 });
    const coded = textarea({ placeholder: 'Base64…', rows: 6 });
    const urlSafe = checkbox('URL-safe (- and _ , no padding)');
    const err = note();
    const enc = () => { coded.value = b64encode(plain.value, urlSafe.input.checked); err.clear(); };
    plain.addEventListener('input', enc);
    urlSafe.input.addEventListener('change', enc);
    coded.addEventListener('input', () => {
      try { plain.value = new TextDecoder('utf-8', { fatal: true }).decode(b64bytes(coded.value)); err.clear(); }
      catch { err.error('That is not valid Base64 text (or it decodes to binary — use the File tab).'); }
    });
    const textPane = card(
      grid(
        h('div', {}, h('div', { class: 'output-head' }, h('span', { class: 'field-label' }, 'Text'), copyBtn(() => plain.value)), plain),
        h('div', {}, h('div', { class: 'output-head' }, h('span', { class: 'field-label' }, 'Base64'), copyBtn(() => coded.value)), coded)),
      urlSafe, err.el,
      h('p', { class: 'field-hint' }, 'Type in either box — the other one follows.'));

    const drop = h('label', { class: 'drop' }, h('input', { type: 'file', hidden: true }), h('span', {}, 'Drop a file here, or tap to choose one'));
    const dataUrl = output('Data URL', { multiline: true, rows: 4 });
    const raw = output('Base64 only', { multiline: true, rows: 4 });
    const preview = h('div', { class: 'preview' });
    const info = note();
    function readFile(f) {
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        dataUrl.set(r.result);
        raw.set(String(r.result).split(',')[1] || '');
        info.info(`${f.name} — ${f.size.toLocaleString()} bytes → ${String(r.result).length.toLocaleString()} characters`);
        preview.replaceChildren(f.type.startsWith('image/') ? h('img', { src: r.result, alt: f.name }) : '');
      };
      r.readAsDataURL(f);
    }
    drop.querySelector('input').addEventListener('change', e => readFile(e.target.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });

    const back = textarea({ placeholder: 'Paste Base64 or a data: URL to turn it back into a file', rows: 3 });
    const backErr = note();
    const name = input({ value: 'file.bin', mono: true });
    const save = h('button', { class: 'btn', type: 'button' }, 'Download file');
    save.onclick = () => {
      try {
        const m = back.value.trim().match(/^data:([^;,]+)/);
        download(name.value || 'file', new Blob([b64bytes(back.value)], { type: m ? m[1] : 'application/octet-stream' }));
        backErr.clear();
      } catch { backErr.error('That is not valid Base64.'); }
    };
    const filePane = card(drop, info.el, preview, dataUrl.el, raw.el,
      h('h3', {}, 'Base64 → file'), back, row(field('File name', name), save), backErr.el);
    filePane.hidden = true;

    root.append(mode, textPane, filePane);
  },
};

// JSON / YAML / TOML / CSV through one parsed value in the middle.
const FORMATS = ['JSON', 'YAML', 'TOML', 'CSV'];
function parseAs(fmt, text) {
  if (fmt === 'JSON') return JSON.parse(text);
  if (fmt === 'YAML') return yaml.load(text);
  if (fmt === 'TOML') return toml.parse(text);
  const r = Papa.parse(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (r.errors.length) throw new Error(`CSV row ${r.errors[0].row + 1}: ${r.errors[0].message}`);
  return r.data;
}
function flatten(obj, pre = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}
function writeAs(fmt, val, indent) {
  if (fmt === 'JSON') return JSON.stringify(val, null, indent);
  if (fmt === 'YAML') return yaml.dump(val, { indent, lineWidth: -1, noRefs: true });
  if (fmt === 'TOML') {
    if (Array.isArray(val)) val = { items: val };
    if (val === null || typeof val !== 'object') throw new Error('TOML needs an object at the top.');
    return toml.stringify(val);
  }
  const rows = Array.isArray(val) ? val : [val];
  if (!rows.every(r => r && typeof r === 'object')) throw new Error('CSV needs a list of objects (rows).');
  return Papa.unparse(rows.map(r => flatten(r)));
}
const SAMPLE = `{
  "name": "Kasih Alza",
  "rooms": 3,
  "open": true,
  "prices": { "weekday": 180, "weekend": 230 },
  "tags": ["homestay", "melaka"]
}`;

const formats = {
  id: 'formats', name: 'Data formats', group: 'convert', icon: 'arrow-left-right',
  desc: 'Convert between JSON, YAML, TOML and CSV in any direction.',
  keywords: 'json yaml toml csv convert config data xml spreadsheet',
  render(root) {
    const from = select(FORMATS, 'JSON'), to = select(FORMATS, 'YAML');
    const indent = select([['2', '2 spaces'], ['4', '4 spaces']], '2');
    const src = textarea({ rows: 14, value: SAMPLE });
    const out = output('Result', { multiline: true, rows: 14 });
    const err = note();
    const swap = h('button', { class: 'btn icon-btn', type: 'button', title: 'Swap', 'aria-label': 'Swap formats' }, '⇄');
    swap.onclick = () => {
      const r = out.get();
      [from.value, to.value] = [to.value, from.value];
      if (r) src.value = r;
      run();
    };
    function run() {
      if (!src.value.trim()) { out.set(''); err.clear(); return; }
      try { out.set(writeAs(to.value, parseAs(from.value, src.value), +indent.value)); err.clear(); }
      catch (e) { out.set(''); err.error(e.message); }
    }
    root.append(
      card(row(field('From', from), swap, field('To', to), field('Indent', indent))),
      h('div', { class: 'grid2' }, card(field('Input', src), err.el), card(out.el)),
    );
    on([src], run);
    on([from, to, indent], run, 'change');
  },
};

const dateTime = {
  id: 'datetime', name: 'Date & timestamp', group: 'convert', icon: 'calendar-clock',
  desc: 'Unix timestamps, ISO dates and time zones — paste any one, read all of them.',
  keywords: 'unix epoch timestamp iso 8601 utc timezone date time convert',
  render(root) {
    const src = input({ placeholder: '1759800000, 2026-10-07T09:00, or “now”', mono: true });
    const zones = ['Asia/Kuala_Lumpur', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zones.includes(local)) zones.unshift(local);
    const tz = select(zones, local);
    const err = note();
    const rows = ['Unix seconds', 'Unix milliseconds', 'ISO 8601 (UTC)', 'In time zone', 'RFC 2822', 'Relative', 'Day of the year / week'];
    const outs = Object.fromEntries(rows.map(r => [r, output(r)]));
    const now = h('button', { class: 'btn', type: 'button', onclick: () => { src.value = 'now'; run(); } }, 'Now');

    function parse(v) {
      v = v.trim();
      if (!v || v.toLowerCase() === 'now') return new Date();
      if (/^-?\d+(\.\d+)?$/.test(v)) {
        const n = +v;
        // Under 10^11 it is seconds (that is up to year 5138); above, milliseconds.
        return new Date(Math.abs(n) < 1e11 ? n * 1000 : n);
      }
      return new Date(v);
    }
    function run() {
      const d = parse(src.value);
      if (isNaN(d)) { err.error('Could not read that as a date.'); rows.forEach(r => outs[r].set('')); return; }
      err.clear();
      const z = tz.value;
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: z, dateStyle: 'full', timeStyle: 'long' });
      const sec = d.getTime() / 1000;
      const diff = Math.round(sec - Date.now() / 1000);
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      const units = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [2592000, 'day'], [31536000, 'month'], [Infinity, 'year']];
      const div = { second: 1, minute: 60, hour: 3600, day: 86400, month: 2592000, year: 31536000 };
      const unit = units.find(([lim]) => Math.abs(diff) < lim)[1];
      const start = Date.UTC(d.getUTCFullYear(), 0, 1);
      const doy = Math.floor((d - start) / 86400000) + 1;
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
      outs['Unix seconds'].set(String(Math.floor(sec)));
      outs['Unix milliseconds'].set(String(d.getTime()));
      outs['ISO 8601 (UTC)'].set(d.toISOString());
      outs['In time zone'].set(fmt.format(d));
      outs['RFC 2822'].set(d.toUTCString());
      outs['Relative'].set(rtf.format(Math.round(diff / div[unit]), unit));
      outs['Day of the year / week'].set(`Day ${doy}, ISO week ${week}`);
    }
    src.value = 'now';
    root.append(card(row(field('Date or timestamp', src), now), field('Time zone', tz), err.el), card(...rows.map(r => outs[r].el)));
    on(src, run);
    tz.addEventListener('change', run);
  },
};

// Colour maths: everything goes through sRGB 0–255.
function parseColor(str) {
  const probe = h('div', { style: { color: 'rgb(1,2,3)', display: 'none' } });
  document.body.append(probe);
  probe.style.color = str.trim();
  const c = getComputedStyle(probe).color;
  probe.remove();
  if (c === 'rgb(1, 2, 3)' && !/^rgb\(\s*1\D+2\D+3\D*\)$/.test(str.trim())) return null;
  const m = c.match(/[\d.]+/g).map(Number);
  return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let hh = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)];
}
function luminance({ r, g, b }) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function rgbToOklch({ r, g, b }) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, Bb);
  let H = Math.atan2(Bb, A) * 180 / Math.PI; if (H < 0) H += 360;
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${C < 0.0005 ? 0 : H.toFixed(1)})`;
}

const color = {
  id: 'color', name: 'Colour converter', group: 'convert', icon: 'palette',
  desc: 'HEX, RGB, HSL and OKLCH, with contrast against white and black.',
  keywords: 'color colour hex rgb hsl oklch picker contrast css',
  render(root) {
    const src = input({ value: '#e8a33d', mono: true, placeholder: '#e8a33d, rgb(…), hsl(…), teal' });
    const picker = h('input', { type: 'color', class: 'swatch-input', value: '#e8a33d', 'aria-label': 'Pick a colour' });
    const err = note();
    const swatch = h('div', { class: 'swatch' });
    const names = ['HEX', 'RGB', 'HSL', 'OKLCH'];
    const outs = Object.fromEntries(names.map(n => [n, output(n)]));
    const cw = h('div', { class: 'contrast' }), cb = h('div', { class: 'contrast' });
    function run() {
      const c = parseColor(src.value);
      if (!c) { err.error('Not a colour I can read.'); return; }
      err.clear();
      const hex = '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('') +
        (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');
      const [hh, s, l] = rgbToHsl(c);
      const a = c.a < 1 ? ` / ${+c.a.toFixed(2)}` : '';
      outs.HEX.set(hex);
      outs.RGB.set(`rgb(${c.r} ${c.g} ${c.b}${a})`);
      outs.HSL.set(`hsl(${hh} ${s}% ${l}%${a})`);
      outs.OKLCH.set(rgbToOklch(c).replace(')', `${a})`));
      picker.value = hex.slice(0, 7);
      swatch.style.background = src.value;
      for (const [el, bg, label] of [[cw, { r: 255, g: 255, b: 255 }, 'on white'], [cb, { r: 0, g: 0, b: 0 }, 'on black']]) {
        const ratio = contrast(c, bg);
        const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large text' : 'fails';
        el.style.background = label === 'on white' ? '#fff' : '#000';
        el.style.color = hex.slice(0, 7);
        el.replaceChildren(h('strong', {}, 'Aa'), ` ${label}: ${ratio.toFixed(2)} : 1 — ${grade}`);
      }
    }
    picker.addEventListener('input', () => { src.value = picker.value; run(); });
    root.append(
      card(row(field('Any CSS colour', src), picker), err.el, swatch, h('div', { class: 'grid2' }, cw, cb)),
      card(...names.map(n => outs[n].el)));
    on(src, run);
  },
};

const BASES = [['2', 'Binary'], ['8', 'Octal'], ['10', 'Decimal'], ['16', 'Hex'], ['36', 'Base 36']];
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
function parseBig(str, base) {
  str = str.trim().toLowerCase().replace(/[_\s]/g, '').replace(/^0[xbo]/, '');
  let neg = false;
  if (str.startsWith('-')) { neg = true; str = str.slice(1); }
  if (!str) return null;
  let n = 0n;
  const B = BigInt(base);
  for (const ch of str) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error(`“${ch}” is not a base-${base} digit.`);
    n = n * B + BigInt(d);
  }
  return neg ? -n : n;
}

const bases = {
  id: 'bases', name: 'Number bases', group: 'convert', icon: 'calculator',
  desc: 'Binary, octal, decimal, hex and any base up to 36 — edit any one.',
  keywords: 'binary octal decimal hexadecimal hex base convert radix integer',
  render(root) {
    const fields = BASES.map(([b, label]) => ({ b: +b, label, el: input({ mono: true, placeholder: label }) }));
    const custom = input({ type: 'number', value: 3, min: 2, max: 36 });
    const customOut = input({ mono: true });
    fields.push({ b: 0, label: 'custom', el: customOut });
    const err = note();
    function from(src) {
      const base = src.b || Math.min(36, Math.max(2, +custom.value || 2));
      try {
        const n = parseBig(src.el.value, base);
        err.clear();
        for (const f of fields) {
          if (f === src) continue;
          const fb = f.b || Math.min(36, Math.max(2, +custom.value || 2));
          f.el.value = n == null ? '' : n.toString(fb);
        }
      } catch (e) { err.error(e.message); }
    }
    for (const f of fields) f.el.addEventListener('input', () => from(f));
    custom.addEventListener('input', () => from(fields[2]));
    fields[2].el.value = '2026';
    root.append(card(
      ...fields.slice(0, -1).map(f => h('div', { class: 'output' }, h('div', { class: 'output-head' }, h('span', { class: 'field-label' }, `${f.label} (base ${f.b})`), copyBtn(() => f.el.value)), f.el)),
      h('div', { class: 'output' }, h('div', { class: 'output-head' }, h('span', { class: 'field-label' }, 'Custom base'), copyBtn(() => customOut.value)), row(custom, customOut)),
      err.el,
      h('p', { class: 'field-hint' }, 'Works with numbers of any size. Prefixes like 0x and 0b are ignored.')));
    from(fields[2]);
  },
};

export default [base64, formats, dateTime, color, bases];
