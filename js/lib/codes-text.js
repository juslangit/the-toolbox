// Text codes for the Codes & ciphers drawer: Morse, spelling alphabets, Braille.
// Pure functions (no DOM), so they can be checked on their own.

// --- Morse (ITU-R M.1677 letters, digits and punctuation) -------------------
export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
  '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
  '$': '...-..-', '@': '.--.-.',
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

// Text → Morse. Letters are separated by a space, words by " / ".
export function toMorse(text) {
  const skipped = new Set();
  const words = text.toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().split(/\s+/).filter(Boolean);
  const out = words.map(w => [...w].map(c => {
    if (MORSE[c]) return MORSE[c];
    skipped.add(c);
    return null;
  }).filter(Boolean).join(' ')).filter(Boolean).join(' / ');
  return { morse: out, skipped: [...skipped] };
}

// Morse → text. Accepts . - and look-alikes (· • − – _), "/" or "|" or 3+ spaces between words.
export function fromMorse(code) {
  const unknown = new Set();
  const norm = code.replace(/[·•∙⋅]/g, '.').replace(/[−–—_‒]/g, '-').trim();
  if (!norm) return { text: '', unknown: [] };
  const text = norm.split(/\s*[/|]\s*|\s{3,}|\n+/).map(w => w.trim().split(/\s+/).filter(Boolean).map(l => {
    if (FROM_MORSE[l]) return FROM_MORSE[l];
    unknown.add(l);
    return '�';
  }).join('')).join(' ').replace(/ +/g, ' ').trim();
  return { text, unknown: [...unknown] };
}

// Timing. unit = 1.2 / wpm seconds (PARIS standard). With Farnsworth spacing the
// letters are sent at charWpm but the gaps are stretched so the overall speed is effWpm.
export function morseTiming(charWpm, effWpm = charWpm) {
  const u = 1.2 / charWpm;
  if (!effWpm || effWpm >= charWpm) return { dot: u, dash: 3 * u, intra: u, letter: 3 * u, word: 7 * u };
  const ta = (60 * charWpm - 37.2 * effWpm) / (effWpm * charWpm);
  return { dot: u, dash: 3 * u, intra: u, letter: 3 * ta / 19, word: 7 * ta / 19 };
}

// A list of tone-on spans [{ at, dur, i }] (seconds from start) plus the total length.
// i is the index of the letter in the Morse string's letter list, for highlighting.
export function morseSchedule(morse, timing) {
  const spans = [];
  let t = 0, li = 0;
  const words = morse.trim().split(/\s*\/\s*/).filter(Boolean);
  words.forEach((w, wi) => {
    const letters = w.split(/\s+/).filter(Boolean);
    letters.forEach((l, k) => {
      [...l].forEach((s, j) => {
        const dur = s === '-' ? timing.dash : timing.dot;
        if (s === '.' || s === '-') spans.push({ at: t, dur, i: li });
        t += dur;
        if (j < l.length - 1) t += timing.intra;
      });
      li++;
      if (k < letters.length - 1) t += timing.letter;
    });
    if (wi < words.length - 1) t += timing.word;
  });
  return { spans, total: t };
}

// --- spelling alphabets ------------------------------------------------------
const NATO_WORDS = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ');
const NATO_DIGITS = 'Zero One Two Three Four Five Six Seven Eight Nine'.split(' ');
const DE_DIGITS = 'Null Eins Zwei Drei Vier Fünf Sechs Sieben Acht Neun'.split(' ');
const DIN_2022 = 'Aachen Berlin Chemnitz Düsseldorf Essen Frankfurt Goslar Hamburg Ingelheim Jena Köln Leipzig München Nürnberg Offenbach Potsdam Quickborn Rostock Salzwedel Tübingen Unna Völklingen Wuppertal Xanten Ypsilon Zwickau'.split(' ');
const DIN_OLD = 'Anton Berta Cäsar Dora Emil Friedrich Gustav Heinrich Ida Julius Kaufmann Ludwig Martha Nordpol Otto Paula Quelle Richard Samuel Theodor Ulrich Viktor Wilhelm Xanthippe Ypsilon Zacharias'.split(' ');
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const table = (words, digits, extra = {}) => ({
  ...Object.fromEntries([...AZ].map((c, i) => [c, words[i]])),
  ...Object.fromEntries(digits.map((d, i) => [String(i), d])),
  ...extra,
});

export const ALPHABETS = {
  nato: {
    name: 'NATO / ICAO', lang: 'en-GB',
    map: table(NATO_WORDS, NATO_DIGITS, { '.': 'Decimal', '-': 'Dash' }),
    alt: { alpha: 'A', juliet: 'J', whisky: 'W', xray: 'X', 'x-ray': 'X', fife: '5', niner: '9', tree: '3', fower: '4', stop: '.', point: '.' },
  },
  din: {
    name: 'German — DIN 5009 (2022, cities)', lang: 'de-DE',
    map: table(DIN_2022, DE_DIGITS, { Ä: 'Umlaut Aachen', Ö: 'Umlaut Offenbach', Ü: 'Umlaut Unna', ß: 'Eszett' }),
    alt: { zwo: '2' },
  },
  dinold: {
    name: 'German — traditional (names)', lang: 'de-DE',
    map: table(DIN_OLD, DE_DIGITS, { Ä: 'Ärger', Ö: 'Ökonom', Ü: 'Übermut', ß: 'Eszett', SCH: 'Schule', CH: 'Charlotte' }),
    alt: { siegfried: 'S', zeppelin: 'Z', zwo: '2', 'cäsar': 'C' },
  },
};

// Text → list of words. Spaces become a "/" marker.
export function spell(text, key = 'nato') {
  const { map } = ALPHABETS[key];
  const multi = Object.keys(map).filter(k => k.length > 1).sort((a, b) => b.length - a.length);
  const up = text.toUpperCase().replace(/ẞ/g, 'ß');
  const out = [];
  for (let i = 0; i < up.length;) {
    const m = multi.find(k => up.startsWith(k, i));
    if (m) { out.push(map[m]); i += m.length; continue; }
    const c = text[i] === 'ß' ? 'ß' : up[i];
    if (/\s/.test(c)) { if (out.length && out[out.length - 1] !== '/') out.push('/'); }
    else out.push(map[c] || `“${c}”`);
    i++;
  }
  while (out[out.length - 1] === '/') out.pop();
  return out;
}

// Spelling words → text. Unknown words come back in [brackets].
export function unspell(text, key = 'nato') {
  const { map, alt } = ALPHABETS[key];
  const rev = {};
  for (const [k, v] of Object.entries(map)) rev[v.toLowerCase()] = k;
  for (const [k, v] of Object.entries(alt || {})) rev[k] = v;
  // Two-word calls ("Umlaut Aachen") first.
  const src = text.replace(/umlaut[\s-]+(\p{L}+)/giu, 'Umlaut_$1');
  return src.split(/\s*[/|]\s*|\n/).map(w => w.trim().split(/[\s,]+/).filter(Boolean).map(t => {
    const k = t.toLowerCase().replace(/_/g, ' ').replace(/[.]$/, '');
    if (rev[k] != null) return rev[k];
    return `[${t.replace(/_/g, ' ')}]`;
  }).join('')).join(' ');
}

// --- Braille (Unified English Braille, grade 1 / uncontracted) --------------
// A cell is a set of dot numbers 1–6. Unicode puts dot n at bit n-1 from U+2800.
export const cell = dots => String.fromCharCode(0x2800 + [...String(dots)].reduce((s, d) => s | (1 << (d - 1)), 0));
export const dotsOf = ch => {
  const n = ch.charCodeAt(0) - 0x2800;
  return [1, 2, 3, 4, 5, 6, 7, 8].filter(d => n & (1 << (d - 1))).join('');
};
const LETTER_DOTS = '1 12 14 145 15 124 1245 125 24 245 13 123 134 1345 135 1234 12345 1235 234 2345 136 1236 2456 1346 13456 1356'.split(' ');
const LETTERS = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((c, i) => [c, cell(LETTER_DOTS[i])]));
const DIGITS = Object.fromEntries([...'1234567890'].map((c, i) => [c, cell(LETTER_DOTS[i])]));
const PUNCT = {
  ',': cell(2), '.': cell(256), '?': cell(236), '!': cell(235), "'": cell(3), '’': cell(3), ':': cell(25), ';': cell(23),
  '-': cell(36), '"': cell(6) + cell(2356), '“': cell(236), '”': cell(356),
  '(': cell(5) + cell(126), ')': cell(5) + cell(345), '/': cell(456) + cell(34), '@': cell(4) + cell(1),
  '&': cell(4) + cell(12346), '*': cell(5) + cell(35), '+': cell(5) + cell(235), '=': cell(5) + cell(2356), '#': cell(456) + cell(1456),
  '%': cell(46) + cell(356), '$': cell(4) + cell(234),
};
export const SIGN = { capital: cell(6), number: cell(3456), grade1: cell(56) };
const CAPWORD = SIGN.capital + SIGN.capital;

export function toBraille(text) {
  const skipped = new Set();
  let out = '';
  let numMode = false;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const lower = c.toLowerCase();
    if (/\d/.test(c)) {
      if (!numMode) { out += SIGN.number; numMode = true; }
      out += DIGITS[c];
      continue;
    }
    // A decimal point or comma between digits keeps number mode going.
    if (numMode && (c === '.' || c === ',') && /\d/.test(chars[i + 1] || '')) { out += PUNCT[c]; continue; }
    if (LETTERS[lower]) {
      // After a number, a-j would read as digits, so mark grade 1.
      if (numMode && 'abcdefghij'.includes(lower)) out += SIGN.grade1;
      numMode = false;
      if (c !== lower) {
        // Whole word in capitals (2+ letters) → double capital sign once.
        let j = i; while (j < chars.length && /\p{L}/u.test(chars[j])) j++;
        const word = chars.slice(i, j).join('');
        const startOfWord = i === 0 || !/\p{L}/u.test(chars[i - 1]);
        if (startOfWord && word.length > 1 && word === word.toUpperCase()) {
          out += CAPWORD + word.toLowerCase().split('').map(x => LETTERS[x] || (skipped.add(x), '')).join('');
          i = j - 1;
          continue;
        }
        out += SIGN.capital;
      }
      out += LETTERS[lower];
      continue;
    }
    numMode = false;
    if (c === ' ') out += ' ';
    else if (c === '\n') out += '\n';
    else if (PUNCT[c]) out += PUNCT[c];
    else if (/[⠀-⣿]/.test(c)) out += c;
    else skipped.add(c);
  }
  return { braille: out, skipped: [...skipped] };
}

const REV_LETTERS = Object.fromEntries(Object.entries(LETTERS).map(([k, v]) => [v, k]));
const REV_DIGITS = Object.fromEntries(Object.entries(DIGITS).map(([k, v]) => [v, k]));
const REV_PUNCT = Object.entries(PUNCT).filter(([k]) => !'’“”'.includes(k)).sort((a, b) => b[1].length - a[1].length);

export function fromBraille(br) {
  let out = '';
  let numMode = false, capNext = false, capWord = false;
  const s = [...br.replace(/⠀/g, ' ')];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ' || c === '\n') { out += c; numMode = false; capWord = false; continue; }
    if (c === SIGN.number) { numMode = true; continue; }
    if (c === SIGN.grade1) { numMode = false; continue; }
    if (c === SIGN.capital && s[i + 1] === SIGN.capital) { capWord = true; i++; continue; }
    if (c === SIGN.capital && s[i + 1] && s[i + 1] !== SIGN.capital && REV_LETTERS[s[i + 1]]) { capNext = true; continue; }
    if (numMode && REV_DIGITS[c]) { out += REV_DIGITS[c]; continue; }
    if (numMode && (c === PUNCT['.'] || c === PUNCT[','])) { out += c === PUNCT['.'] ? '.' : ','; continue; }
    const two = c + (s[i + 1] || '');
    const p2 = REV_PUNCT.find(([, v]) => v.length === 2 && v === two);
    if (p2) { out += p2[0]; i++; numMode = false; continue; }
    if (REV_LETTERS[c]) {
      numMode = false;
      const l = REV_LETTERS[c];
      out += capNext || capWord ? l.toUpperCase() : l;
      capNext = false;
      continue;
    }
    const p1 = REV_PUNCT.find(([, v]) => v.length === 1 && v === c);
    if (p1) { out += p1[0]; numMode = false; capWord = false; continue; }
    out += c;
  }
  return out;
}
