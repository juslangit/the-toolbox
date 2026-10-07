// Unicode names and code point facts for the Glyph browser.
// Names come from vendor/unicode-names.js (a subset of UnicodeData.txt, loaded
// only when the tool opens). DATA has one line per character: "~hex;" when the
// code point does not follow the previous one, then a character whose code
// minus 32 is how much of the previous name to reuse, then the rest.

let cache;
export async function loadNames() {
  if (cache) return cache;
  const mod = await import('../../vendor/unicode-names.js');
  const names = new Map();
  let cp = -1, prev = '';
  for (const line of mod.DATA.split('\n')) {
    let s = line;
    if (s[0] === '~') { const i = s.indexOf(';'); cp = parseInt(s.slice(1, i), 16); s = s.slice(i + 1); }
    else cp++;
    prev = prev.slice(0, s.charCodeAt(0) - 32) + s.slice(1);
    names.set(cp, prev);
  }
  cache = { names, blocks: mod.BLOCKS, version: mod.VERSION };
  return cache;
}

// Drawer groups → the Unicode blocks they show.
export const GROUPS = [
  ['Latin', ['Basic Latin', 'Latin-1 Supplement', 'Latin Extended-A', 'Latin Extended-B', 'Latin Extended Additional', 'IPA Extensions', 'Spacing Modifier Letters', 'Combining Diacritical Marks', 'Alphabetic Presentation Forms', 'Halfwidth and Fullwidth Forms']],
  ['Punctuation', ['General Punctuation', 'Superscripts and Subscripts', 'CJK Symbols and Punctuation', 'Specials']],
  ['Arrows', ['Arrows', 'Supplemental Arrows-A', 'Supplemental Arrows-B', 'Supplemental Arrows-C', 'Miscellaneous Symbols and Arrows']],
  ['Maths', ['Mathematical Operators', 'Supplemental Mathematical Operators', 'Miscellaneous Mathematical Symbols-A', 'Miscellaneous Mathematical Symbols-B', 'Number Forms', 'Mathematical Alphanumeric Symbols']],
  ['Box drawing', ['Box Drawing', 'Block Elements', 'Geometric Shapes', 'Geometric Shapes Extended', 'Braille Patterns', 'Symbols for Legacy Computing']],
  ['Currency & letterlike', ['Currency Symbols', 'Letterlike Symbols', 'Enclosed Alphanumerics', 'Enclosed Alphanumeric Supplement', 'Control Pictures', 'Miscellaneous Technical']],
  ['Emoji', ['Emoticons', 'Miscellaneous Symbols and Pictographs', 'Transport and Map Symbols', 'Supplemental Symbols and Pictographs', 'Symbols and Pictographs Extended-A']],
  ['Symbols', ['Miscellaneous Symbols', 'Dingbats', 'Playing Cards', 'Chess Symbols', 'Musical Symbols']],
  ['Jawi / Arabic', ['Arabic', 'Arabic Supplement', 'Arabic Extended-A', 'Arabic Presentation Forms-A', 'Arabic Presentation Forms-B']],
  ['Greek & Cyrillic', ['Greek and Coptic', 'Greek Extended', 'Cyrillic', 'Cyrillic Supplement']],
  ['Other scripts', ['Hebrew', 'Devanagari', 'Tamil', 'Thai', 'Hiragana', 'Katakana']],
];

// Letters Malay written in Jawi adds to Arabic, so they are easy to find.
export const JAWI = [0x0686, 0x06A0, 0x06A4, 0x06AC, 0x06BD, 0x06CF, 0x0762];

const NAMED = { 0x22: 'quot', 0x26: 'amp', 0x27: 'apos', 0x3C: 'lt', 0x3E: 'gt', 0xA0: 'nbsp', 0xA9: 'copy', 0xAE: 'reg', 0xB0: 'deg',
  0xB1: 'plusmn', 0xB7: 'middot', 0xD7: 'times', 0xF7: 'divide', 0xA3: 'pound', 0xA5: 'yen', 0xA2: 'cent', 0x20AC: 'euro', 0xA7: 'sect',
  0xB6: 'para', 0xAB: 'laquo', 0xBB: 'raquo', 0xBC: 'frac14', 0xBD: 'frac12', 0xBE: 'frac34', 0xB2: 'sup2', 0xB3: 'sup3', 0xB5: 'micro',
  0x2013: 'ndash', 0x2014: 'mdash', 0x2018: 'lsquo', 0x2019: 'rsquo', 0x201C: 'ldquo', 0x201D: 'rdquo', 0x2022: 'bull', 0x2026: 'hellip',
  0x2122: 'trade', 0x2190: 'larr', 0x2191: 'uarr', 0x2192: 'rarr', 0x2193: 'darr', 0x2194: 'harr', 0x21D2: 'rArr', 0x2264: 'le',
  0x2265: 'ge', 0x2260: 'ne', 0x221E: 'infin', 0x2211: 'sum', 0x221A: 'radic', 0x2248: 'asymp', 0x2212: 'minus', 0x2032: 'prime',
  0x2665: 'hearts', 0x2660: 'spades', 0x2663: 'clubs', 0x2666: 'diams', 0x2713: 'check', 0x2717: 'cross', 0x03B1: 'alpha',
  0x03B2: 'beta', 0x03C0: 'pi', 0x03A9: 'Omega', 0x03BC: 'mu', 0x00E9: 'eacute', 0x00FC: 'uuml', 0x00F1: 'ntilde', 0x00DF: 'szlig', 0x2009: 'thinsp' };

const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');
export const uplus = cp => 'U+' + hex(cp);

export function facts(cp) {
  const ch = String.fromCodePoint(cp);
  const u8 = [...new TextEncoder().encode(ch)];
  const u16 = [...Array(ch.length)].map((_, i) => ch.charCodeAt(i));
  return {
    char: ch,
    code: uplus(cp),
    decimal: String(cp),
    utf8: u8.map(b => hex(b, 2)).join(' '),
    utf16: u16.map(u => hex(u)).join(' '),
    html: (NAMED[cp] ? `&${NAMED[cp]}; ` : '') + `&#x${cp.toString(16).toUpperCase()}; &#${cp};`,
    css: '\\' + cp.toString(16).toUpperCase(),
    js: cp > 0xFFFF ? `\\u{${cp.toString(16).toUpperCase()}}  ${u16.map(u => '\\u' + hex(u)).join('')}` : '\\u' + hex(cp),
    url: u8.map(b => '%' + hex(b, 2)).join(''),
  };
}

// What to draw for a code point: combining marks get a dotted circle to sit on.
export const shown = (cp, name = '') => (/^COMBINING /.test(name) || (cp >= 0x300 && cp <= 0x36F) ? '◌' : '') + String.fromCodePoint(cp);

// Search: "snowman", "U+2603", "0x2603", "2603", or pasted characters.
export function search(data, q, limit = 300) {
  q = q.trim();
  if (!q) return [];
  const out = [];
  const code = q.match(/^(?:u\+|0x|\\u\{?|&#x)([0-9a-f]{1,6})\}?;?$/i) || q.match(/^([0-9a-f]{4,6})$/i);
  if (code && /\d|^(u\+|0x|\\u|&#x)/i.test(q)) {
    const cp = parseInt(code[1], 16);
    if (cp <= 0x10FFFF) out.push(cp);
  }
  const dec = q.match(/^&#(\d+);?$/);
  if (dec) out.push(+dec[1]);
  const words = q.toUpperCase().split(/\s+/).filter(Boolean);
  if (/^[\x20-\x7e]+$/.test(q) && words.every(w => /^[A-Z0-9-]+$/.test(w))) {
    const exact = [], starts = [], rest = [];
    for (const [cp, name] of data.names) {
      if (!words.every(w => name.includes(w))) continue;
      const parts = name.split(/[\s-]/);
      if (name === words.join(' ')) exact.push(cp);
      else if (words.every(w => parts.includes(w))) starts.push(cp);
      else rest.push(cp);
    }
    out.push(...exact, ...starts, ...rest);
  } else if (!out.length) {
    // Pasted characters: show each one (non-ASCII, or any if all are symbols).
    for (const ch of q) if (!/\s/.test(ch)) out.push(ch.codePointAt(0));
  }
  return [...new Set(out)].slice(0, limit);
}

export const blockOf = (data, cp) => data.blocks.find(([s, e]) => cp >= s && cp <= e)?.[2] || '';
