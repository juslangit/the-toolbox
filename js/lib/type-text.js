// Plain-text transforms for the Text scratchpad (js/tools/type.js).
// Every function takes the whole text and returns new text, so the tool can
// keep an undo stack and the tests can call them directly.

const split = t => t.split(/\r?\n/);
const byLine = fn => t => fn(split(t)).join('\n');
const az = new Intl.Collator(undefined, { sensitivity: 'base' });
const natural = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export const sortAZ = byLine(l => [...l].sort((a, b) => az.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)));
export const sortZA = byLine(l => [...l].sort((a, b) => az.compare(b, a) || (a < b ? 1 : a > b ? -1 : 0)));
export const sortNatural = byLine(l => [...l].sort((a, b) => natural.compare(a, b)));
export const sortLength = byLine(l => [...l].sort((a, b) => [...a].length - [...b].length || az.compare(a, b)));
export const reverse = byLine(l => [...l].reverse());
export const trim = byLine(l => l.map(s => s.trim()));
export const removeEmpty = byLine(l => l.filter(s => s.trim() !== ''));

// Keeps the first copy of each line. ignoreCase treats "Pear" and "pear" as one.
export function dedupe(t, ignoreCase = false) {
  const seen = new Set();
  return split(t).filter(s => {
    const k = ignoreCase ? s.toLowerCase() : s;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join('\n');
}

export function shuffle(t) {
  const l = split(t);
  const r = new Uint32Array(l.length);
  crypto.getRandomValues(r);
  for (let i = l.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l.join('\n');
}

export function numberLines(t) {
  const l = split(t);
  const w = String(l.length).length;
  return l.map((s, i) => `${String(i + 1).padStart(w, ' ')}. ${s}`).join('\n');
}

// Word-wraps each line at `cols` characters. Words longer than a line are left whole.
export function wrap(t, cols) {
  cols = Math.max(1, cols | 0);
  return split(t).map(line => {
    if ([...line].length <= cols) return line;
    const indent = line.match(/^\s*/)[0];
    const out = [];
    let cur = '';
    for (const word of line.trim().split(/\s+/)) {
      if (!cur) cur = indent + word;
      else if ([...cur].length + 1 + [...word].length <= cols) cur += ' ' + word;
      else { out.push(cur); cur = indent + word; }
    }
    if (cur) out.push(cur);
    return out.join('\n');
  }).join('\n');
}

export const join = (t, sep = ' ') => split(t).filter(s => s.trim() !== '').join(sep);
export const splitOn = (t, sep = ',') => sep ? t.split(sep).map(s => s.trim()).join('\n') : t;

export const upper = t => t.toUpperCase();
export const lower = t => t.toLowerCase();
const SMALL = new Set('a an and as at but by for from in nor of on or the to up via vs'.split(' '));
export const title = t => t.toLowerCase().replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w, i, all) => {
  const start = i === 0 || /[\n.:!?]\s*$/.test(all.slice(Math.max(0, i - 3), i));
  return !start && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1);
});
export const sentence = t => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

const SPECIAL = { ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', ð: 'd', Ð: 'D', þ: 'th', Þ: 'Th', ı: 'i' };
export const removeAccents = t => t.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
  .replace(/[ßæÆœŒøØđĐłŁðÐþÞı]/g, c => SPECIAL[c]);

export const straightQuotes = t => t
  .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/…/g, '...');
export const smartQuotes = t => t
  .replace(/(^|[\s(\[{—–-])"/g, '$1“').replace(/"/g, '”')
  .replace(/(^|[\s(\[{—–-])'/g, '$1‘').replace(/'/g, '’');

// Find & replace. Returns { text, count } or { error }.
export function replace(t, find, repl, { regex = false, caseSensitive = false } = {}) {
  if (!find) return { text: t, count: 0 };
  let re;
  try {
    re = new RegExp(regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (caseSensitive ? '' : 'i') + 'mu');
  } catch (e) { return { error: e.message }; }
  const count = (t.match(re) || []).length;
  // Plain mode inserts the replacement literally; regex mode expands $1, $<name>, $&.
  const text = regex ? t.replace(re, repl) : t.replace(re, () => repl);
  return { text, count };
}

export function counts(t) {
  const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
  const lines = t ? split(t).length : 0;
  return { chars: [...t].length, words, lines, noSpace: [...t.replace(/\s/g, '')].length };
}
