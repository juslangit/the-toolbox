import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, copyBtn } from '../ui.js';
import cronstrue from '../../vendor/cronstrue.js';
import { textOf } from '../hub.js';
import * as Diff from '../../vendor/diff.js';

const url = {
  id: 'url', name: 'URL encode & parse', group: 'dev', icon: 'link',
  desc: 'Percent-encode text for URLs, and break a URL into its parts and query.',
  keywords: 'url uri encode decode percent query string parse params',
  render(root) {
    const plain = textarea({ placeholder: 'Text with spaces & symbols', rows: 4 });
    const coded = textarea({ placeholder: 'Encoded%20text', rows: 4 });
    const whole = checkbox('Whole URL (keep : / ? & = as they are)');
    const err = note();
    const enc = () => { coded.value = (whole.input.checked ? encodeURI : encodeURIComponent)(plain.value); err.clear(); };
    plain.addEventListener('input', enc);
    whole.input.addEventListener('change', enc);
    coded.addEventListener('input', () => {
      try { plain.value = decodeURIComponent(coded.value.replace(/\+/g, ' ')); err.clear(); }
      catch { err.error('Broken percent-encoding (a % not followed by two hex digits).'); }
    });

    const src = input({ mono: true, value: 'https://example.com:8080/rooms/list?date=2026-10-07&guests=2&sort=price#top' });
    const perr = note();
    const parts = h('dl', { class: 'kv' });
    const query = h('table', { class: 'table' });
    function parse() {
      parts.replaceChildren(); query.replaceChildren();
      if (!src.value.trim()) { perr.clear(); return; }
      let u;
      try { u = new URL(src.value.trim()); perr.clear(); }
      catch { perr.error('Not a full URL — it needs a scheme like https://'); return; }
      for (const [k, v] of [['Protocol', u.protocol], ['User', u.username], ['Password', u.password], ['Host', u.hostname], ['Port', u.port], ['Path', u.pathname], ['Query', u.search], ['Fragment', u.hash], ['Origin', u.origin]])
        if (v) parts.append(h('dt', {}, k), h('dd', {}, v));
      const ps = [...u.searchParams];
      if (ps.length) query.append(h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'Value')), ...ps.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))));
    }
    root.append(
      card(h('h3', {}, 'Encode / decode'), grid(field('Text', plain), field('Encoded', coded)), whole, err.el),
      card(h('h3', {}, 'Parse a URL'), src, perr.el, parts, query));
    on(src, parse);
  },
};

const regex = {
  id: 'regex', name: 'Regex tester', group: 'dev', icon: 'regex',
  desc: 'Try a regular expression on sample text and see every match and group.',
  keywords: 'regular expression regexp match test pattern replace',
  render(root) {
    const pat = input({ mono: true, value: '(\\w+)@(\\w+)\\.com' });
    const flags = ['g', 'i', 'm', 's', 'u'].map(f => { const c = checkbox(f, f === 'g' || f === 'i'); c.flag = f; return c; });
    const text = textarea({ rows: 6, value: 'Write to ali@example.com or siti@todak.com — not bob@site.org.' });
    const repl = input({ mono: true, placeholder: 'Replace with… ($1, $2 for groups)' });
    const err = note();
    const view = h('pre', { class: 'hl' });
    const list = h('ol', { class: 'matches' });
    const replaced = output('After replace', { multiline: true, rows: 3 });
    const count = h('span', { class: 'pill' });
    function run() {
      view.replaceChildren(); list.replaceChildren();
      const f = flags.filter(c => c.input.checked).map(c => c.flag).join('');
      let re;
      try { re = new RegExp(pat.value, f.includes('g') ? f : f + 'g'); err.clear(); }
      catch (e) { err.error(e.message); count.textContent = ''; return; }
      if (!pat.value) { view.textContent = text.value; count.textContent = ''; return; }
      const all = [...text.value.matchAll(re)];
      const shown = f.includes('g') ? all : all.slice(0, 1);
      let last = 0;
      for (const m of shown) {
        view.append(text.value.slice(last, m.index), h('mark', {}, m[0] || '∅'));
        last = m.index + m[0].length;
        list.append(h('li', {},
          h('code', {}, m[0]), h('span', { class: 'field-hint' }, ` at ${m.index}`),
          m.length > 1 && h('div', { class: 'groups' }, m.slice(1).map((g, i) => h('span', { class: 'pill' }, `$${i + 1}: ${g ?? '—'}`)))));
      }
      view.append(text.value.slice(last));
      count.textContent = `${shown.length} match${shown.length === 1 ? '' : 'es'}`;
      replaced.set(repl.value ? text.value.replace(new RegExp(pat.value, f), repl.value) : '');
    }
    const cheats = [['\\d', 'digit'], ['\\w', 'letter, digit or _'], ['\\s', 'space'], ['.', 'any character'], ['^ $', 'start / end'], ['* + ?', '0+, 1+, 0 or 1'], ['{2,4}', '2 to 4 times'], ['[abc]', 'one of'], ['(…)', 'group'], ['(?:…)', 'group, not captured'], ['a|b', 'a or b'], ['\\b', 'word edge']];
    root.append(
      card(field('Pattern', pat), h('div', { class: 'checks' }, flags), err.el, field('Text', text), field('Replace (optional)', repl)),
      card(h('div', { class: 'output-head' }, h('h3', {}, 'Matches'), count), view, list, replaced.el),
      h('details', { class: 'card' }, h('summary', {}, 'Cheat sheet'),
        h('dl', { class: 'kv' }, cheats.flatMap(([a, b]) => [h('dt', {}, h('code', {}, a)), h('dd', {}, b)]))));
    on([pat, text, repl, ...flags.map(c => c.input)], run, 'input', 120);
  },
};

// --- cron ---------------------------------------------------------------
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
function cronField(src, lo, hi, names) {
  const set = new Set();
  for (const part of src.toLowerCase().split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? +stepStr : 1;
    if (!step || step < 1) throw new Error(`Bad step in “${part}”`);
    const val = s => {
      const n = names ? names.indexOf(s) : -1;
      const v = n >= 0 ? n + (lo === 1 ? 1 : 0) : +s;
      if (!/^\d+$/.test(s) && n < 0) throw new Error(`“${s}” is not a number`);
      return v;
    };
    let a, b;
    if (range === '*') { a = lo; b = hi; }
    else if (range.includes('-')) [a, b] = range.split('-').map(val);
    else { a = val(range); b = stepStr ? hi : a; }
    if (a < lo || b > hi || a > b) throw new Error(`“${part}” is outside ${lo}–${hi}`);
    for (let i = a; i <= b; i += step) set.add(i);
  }
  return set;
}
function parseCron(expr) {
  expr = MACROS[expr.trim().toLowerCase()] || expr.trim();
  const f = expr.split(/\s+/);
  if (f.length !== 5) throw new Error('Cron needs 5 fields: minute hour day month weekday');
  const dow = cronField(f[4], 0, 7, DOW);
  if (dow.has(7)) dow.add(0); // 7 is Sunday too
  return {
    min: cronField(f[0], 0, 59), hour: cronField(f[1], 0, 23), dom: cronField(f[2], 1, 31),
    mon: cronField(f[3], 1, 12, MON), dow,
    domAny: f[2] === '*', dowAny: f[4] === '*',
  };
}
function nextRuns(c, from, n) {
  const out = [];
  const d = new Date(from); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  const hours = [...c.hour].sort((a, b) => a - b), mins = [...c.min].sort((a, b) => a - b);
  for (let day = 0; day < 366 * 5 && out.length < n; day++) {
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate() + day);
    if (!c.mon.has(base.getMonth() + 1)) continue;
    const domOk = c.dom.has(base.getDate()), dowOk = c.dow.has(base.getDay());
    // Classic cron: when both day fields are restricted, either one matching is enough.
    const dayOk = c.domAny && c.dowAny ? true : c.domAny ? dowOk : c.dowAny ? domOk : domOk || dowOk;
    if (!dayOk) continue;
    for (const hr of hours) for (const m of mins) {
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hr, m);
      if (t >= d && out.length < n) out.push(t);
    }
  }
  return out;
}

const cron = {
  id: 'cron', name: 'Crontab', group: 'dev', icon: 'timer',
  desc: 'Explain a cron schedule in plain English and list its next run times.',
  keywords: 'cron crontab schedule job timer every minute hour',
  render(root) {
    const src = input({ mono: true, value: '30 9 * * 1-5' });
    const err = note();
    const says = h('p', { class: 'big-say' });
    const runs = h('ol', { class: 'runs' });
    const presets = [['* * * * *', 'Every minute'], ['*/15 * * * *', 'Every 15 min'], ['0 * * * *', 'Hourly'], ['0 0 * * *', 'Daily at midnight'], ['30 9 * * 1-5', 'Weekdays 9:30'], ['0 3 * * 0', 'Sundays 3am'], ['0 0 1 * *', 'Monthly']];
    function run() {
      runs.replaceChildren();
      try {
        const c = parseCron(src.value);
        says.textContent = cronstrue.toString(MACROS[src.value.trim().toLowerCase()] || src.value.trim(), { use24HourTimeFormat: true, verbose: true });
        err.clear();
        const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const list = nextRuns(c, Date.now(), 6);
        runs.append(...list.map(t => h('li', {}, fmt.format(t))));
        if (!list.length) runs.append(h('li', {}, 'Never runs (for example 31 February).'));
      } catch (e) { says.textContent = ''; err.error(e.message); }
    }
    root.append(
      card(field('Cron expression', src), h('div', { class: 'chips' }, presets.map(([e, l]) => h('button', { class: 'chip', type: 'button', onclick: () => { src.value = e; run(); } }, l))), err.el, says),
      card(h('h3', {}, 'Next runs (your time zone)'), runs),
      h('details', { class: 'card' }, h('summary', {}, 'How the five fields work'),
        h('pre', { class: 'mono-block' }, '┌──── minute (0–59)\n│ ┌──── hour (0–23)\n│ │ ┌──── day of month (1–31)\n│ │ │ ┌──── month (1–12 or jan–dec)\n│ │ │ │ ┌──── weekday (0–6, sun–sat; 7 is Sunday too)\n* * * * *\n\n*  any     ,  list (1,15)\n-  range (1-5)     /  step (*/10)')));
    on(src, run);
  },
};

const chmod = {
  id: 'chmod', name: 'chmod calculator', group: 'dev', icon: 'shield-check',
  desc: 'Tick read / write / run for owner, group and others — get 755 and rwxr-xr-x.',
  keywords: 'chmod permissions unix linux file octal rwx 755 644',
  render(root) {
    const who = ['Owner', 'Group', 'Others'], what = [['r', 'Read', 4], ['w', 'Write', 2], ['x', 'Run', 1]];
    const boxes = who.map(() => what.map(() => h('input', { type: 'checkbox' })));
    const octal = input({ mono: true, value: '755' });
    const sym = output('Symbolic');
    const cmd = output('Command');
    const file = input({ mono: true, value: 'script.sh' });
    const table = h('table', { class: 'table perm' },
      h('tr', {}, h('th'), what.map(([, l]) => h('th', {}, l))),
      who.map((w, i) => h('tr', {}, h('th', {}, w), what.map((_, j) => h('td', {}, h('label', { class: 'cell' }, boxes[i][j]))))));
    function fromBoxes() {
      octal.value = boxes.map(r => r.reduce((s, b, j) => s + (b.checked ? what[j][2] : 0), 0)).join('');
      show();
    }
    function fromOctal() {
      const v = octal.value.trim();
      if (!/^[0-7]{3}$/.test(v)) return;
      boxes.forEach((r, i) => r.forEach((b, j) => { b.checked = !!(+v[i] & what[j][2]); }));
      show();
    }
    function show() {
      sym.set(boxes.map(r => r.map((b, j) => b.checked ? what[j][0] : '-').join('')).join(''));
      cmd.set(`chmod ${octal.value} ${file.value}`);
    }
    boxes.flat().forEach(b => b.addEventListener('change', fromBoxes));
    octal.addEventListener('input', fromOctal);
    file.addEventListener('input', show);
    root.append(card(table, grid(field('Octal', octal), field('File', file)), sym.el, cmd.el,
      h('div', { class: 'chips' }, [['644', 'Normal file'], ['755', 'Script / folder'], ['600', 'Private (keys, .env)'], ['700', 'Private folder']].map(([o, l]) =>
        h('button', { class: 'chip', type: 'button', onclick: () => { octal.value = o; fromOctal(); } }, `${o} · ${l}`)))));
    fromOctal();
  },
};

const diff = {
  id: 'diff', name: 'Text diff', group: 'dev', icon: 'diff',
  desc: 'Compare two pieces of text and see exactly what was added and removed.',
  keywords: 'diff compare difference text changes lines words',
  render(root) {
    const a = textarea({ rows: 8, value: 'Room rate: RM180\nCheck-in: 3pm\nWiFi included' });
    const b = textarea({ rows: 8, value: 'Room rate: RM200\nCheck-in: 2pm\nWiFi included\nFree parking' });
    const mode = tabs([['lines', 'Lines'], ['words', 'Words'], ['chars', 'Letters']], 'lines', () => run());
    const view = h('pre', { class: 'diffview' });
    const stats = h('span', { class: 'pill' });
    function run() {
      const fn = { lines: Diff.diffLines, words: Diff.diffWordsWithSpace, chars: Diff.diffChars }[mode.value];
      const parts = fn(a.value, b.value);
      let add = 0, del = 0;
      view.replaceChildren(...parts.map(p => {
        if (p.added) add += p.count; if (p.removed) del += p.count;
        return h(p.added ? 'ins' : p.removed ? 'del' : 'span', {}, p.value);
      }));
      const unit = { lines: 'line', words: 'word', chars: 'letter' }[mode.value];
      stats.textContent = add || del ? `+${add} −${del} ${unit}s` : 'Identical';
    }
    root.append(
      h('div', { class: 'grid2' }, card(field('Before', a)), card(field('After', b))),
      card(h('div', { class: 'output-head' }, mode, stats), view));
    on([a, b], run, 'input', 150);
  },
};

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

const json = {
  id: 'json', name: 'JSON formatter', group: 'dev', icon: 'braces',
  desc: 'Pretty-print, minify, sort and validate JSON — shows where it breaks.',
  keywords: 'json format pretty print minify validate lint beautify',
  accepts: ['.json', 'application/json', 'text'],
  render(root, incoming) {
    textOf(incoming).then(t => { if (t != null) { src.value = t; src.dispatchEvent(new Event('input')); } });
    const src = textarea({ rows: 12, value: '{"guest":"Aminah","nights":2,"paid":true,"extras":["breakfast","late checkout"],"total":{"amount":460,"currency":"MYR"}}' });
    const indent = tabs([['2', '2 spaces'], ['4', '4 spaces'], ['\t', 'Tab'], ['0', 'Minify']], '2', () => run());
    const sort = checkbox('Sort keys A–Z');
    const out = output('Result', { multiline: true, rows: 14 });
    const err = note();
    const ok = h('span', { class: 'pill' });
    function run() {
      if (!src.value.trim()) { out.set(''); err.clear(); ok.textContent = ''; return; }
      try {
        let v = JSON.parse(src.value);
        if (sort.input.checked) v = sortKeys(v);
        const ind = indent.value === '0' ? undefined : indent.value === '\t' ? '\t' : +indent.value;
        out.set(JSON.stringify(v, null, ind));
        err.clear();
        ok.textContent = `✓ Valid · ${new Blob([out.get()]).size.toLocaleString()} bytes`;
      } catch (e) {
        out.set('');
        ok.textContent = '';
        const m = e.message.match(/position (\d+)/);
        let where = '';
        if (m) {
          const pos = +m[1], before = src.value.slice(0, pos);
          where = ` (line ${before.split('\n').length}, column ${pos - before.lastIndexOf('\n')})`;
        }
        err.error(`Invalid JSON${where}: ${e.message}`);
      }
    }
    root.append(card(row(indent, sort, ok)), h('div', { class: 'grid2' }, card(field('Input', src), err.el), card(out.el)));
    on([src, sort.input], run, 'input', 150);
  },
};

export default [url, regex, cron, chmod, diff, json];
export { parseCron, nextRuns };
