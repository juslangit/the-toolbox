// Classical ciphers and a small codebreaker. Pure functions, no DOM.
// Letters keep their case; anything that is not A–Z passes through unchanged
// (except in rail fence, which moves every character).

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const mod = (n, m) => ((n % m) + m) % m;

// Apply f(index 0–25, letterCount) to each letter; letterCount counts letters only (for keyed ciphers).
function mapLetters(text, f) {
  let k = 0;
  return text.replace(/[A-Za-z]/g, ch => {
    const up = ch <= 'Z';
    const r = A[mod(f(ch.toUpperCase().charCodeAt(0) - 65, k++), 26)];
    return up ? r : r.toLowerCase();
  });
}

export const caesar = (text, shift) => mapLetters(text, x => x + Number(shift || 0));
export const rot13 = text => caesar(text, 13);
export const atbash = text => mapLetters(text, x => 25 - x);
export const rot47 = text => text.replace(/[!-~]/g, c => String.fromCharCode(33 + mod(c.charCodeAt(0) - 33 + 47, 94)));

const keyShifts = key => [...String(key || '').toUpperCase().replace(/[^A-Z]/g, '')].map(c => c.charCodeAt(0) - 65);
export function vigenere(text, key, decode = false) {
  const ks = keyShifts(key);
  if (!ks.length) return text;
  return mapLetters(text, (x, k) => x + (decode ? -1 : 1) * ks[k % ks.length]);
}
// Beaufort: C = K − P. It undoes itself.
export function beaufort(text, key) {
  const ks = keyShifts(key);
  if (!ks.length) return text;
  return mapLetters(text, (x, k) => ks[k % ks.length] - x);
}

export const AFFINE_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
const inv26 = a => { for (let i = 1; i < 26; i++) if ((a * i) % 26 === 1) return i; return null; };
export function affine(text, a, b, decode = false) {
  a = Number(a); b = Number(b);
  const ai = inv26(mod(a, 26));
  if (ai == null) throw new Error(`“a” must share no factor with 26 — use one of ${AFFINE_A.join(', ')}.`);
  return decode ? mapLetters(text, y => ai * (y - b)) : mapLetters(text, x => a * x + b);
}

// Rail fence over every character (spaces too), the usual zig-zag.
function railPattern(n, rails) {
  const p = [];
  if (rails < 2) return Array(n).fill(0);
  let r = 0, d = 1;
  for (let i = 0; i < n; i++) { p.push(r); if (r === 0) d = 1; else if (r === rails - 1) d = -1; r += d; }
  return p;
}
export function railFence(text, rails, decode = false) {
  rails = Math.max(2, Number(rails) || 2);
  const chars = [...text];
  const pat = railPattern(chars.length, rails);
  const order = chars.map((_, i) => i).sort((x, y) => pat[x] - pat[y] || x - y);
  if (!decode) return order.map(i => chars[i]).join('');
  const out = Array(chars.length);
  order.forEach((pos, k) => { out[pos] = chars[k]; });
  return out.join('');
}

// Simple substitution: key is the cipher alphabet (what A, B, C… become).
export function substitution(text, key, decode = false) {
  const k = String(key || '').toUpperCase().replace(/[^A-Z]/g, '');
  const uniq = new Set(k);
  if (k.length !== 26 || uniq.size !== 26) throw new Error(`The key alphabet needs all 26 letters exactly once (it has ${uniq.size} different letters${k.length !== uniq.size ? ', some repeated' : ''}).`);
  return mapLetters(text, x => decode ? k.indexOf(A[x]) : k.charCodeAt(x) - 65);
}
// Keyword → cipher alphabet (keyword letters first, then the rest in order).
export const keywordAlphabet = word => [...new Set((String(word).toUpperCase().replace(/[^A-Z]/g, '') + A))].join('');

// Bacon: each letter becomes five A/B. The classic 24-letter table merges I/J and U/V.
export function baconEncode(text, full26 = false) {
  const letters = full26 ? A : 'ABCDEFGHIKLMNOPQRSTUWXYZ';
  return text.toUpperCase().split(/\s+/).filter(Boolean).map(w => [...w].map(c => {
    if (!full26) c = c === 'J' ? 'I' : c === 'V' ? 'U' : c;
    const i = letters.indexOf(c);
    return i < 0 ? '' : i.toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B');
  }).filter(Boolean).join(' ')).join(' / ');
}
export function baconDecode(code, full26 = false) {
  const letters = full26 ? A : 'ABCDEFGHIKLMNOPQRSTUWXYZ';
  return code.split(/\s*\/\s*|\n/).map(w => {
    const bits = w.toUpperCase().replace(/[^AB]/g, '');
    let s = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) s += letters[parseInt(bits.slice(i, i + 5).replace(/A/g, '0').replace(/B/g, '1'), 2)] || '?';
    return s;
  }).join(' ');
}

// A1Z26: A=1 … Z=26, letters joined by "-", words by a space.
export const a1z26Encode = text => text.toUpperCase().split(/\s+/).filter(Boolean)
  .map(w => [...w].filter(c => /[A-Z]/.test(c)).map(c => c.charCodeAt(0) - 64).join('-')).filter(Boolean).join(' ');
export const a1z26Decode = code => code.trim().split(/\s+|\s*\/\s*/).filter(Boolean)
  .map(w => w.split(/[^0-9]+/).filter(Boolean).map(n => A[Number(n) - 1] || '?').join('')).join(' ');

// --- scoring: how English does this look? ---------------------------------------
export const ENGLISH = [8.17, 1.29, 2.78, 4.25, 12.70, 2.23, 2.02, 6.09, 6.97, 0.15, 0.77, 4.03, 2.41,
  6.75, 7.51, 1.93, 0.10, 5.99, 6.33, 9.06, 2.76, 0.98, 2.36, 0.15, 1.97, 0.07].map(p => p / 100);
const COMMON = new Set(('the of and to a in is it you that he was for on are with as i his they be at one have this from or had by not word but what some we can out other were all there when up use your how said an each she which do their time if will way about many then them write would like so these her long make thing see him two has look more day could go come did number sound no most people my over know water than call first who may down side been now find any new work part take get place made live where after back little only round man year came show every good me give our under name very through just form sentence great think say help low line differ turn cause much mean before move right boy old too same tell does set three want air well also play small end put home read hand port large spell add even land here must big high such follow act why ask men change went light kind off need house picture try us again animal point mother world near build self earth father').split(' '));
const BIGRAMS = new Set('TH HE IN ER AN RE ND AT ON NT HA ES ST EN ED TO IT OU EA HI IS OR TI AS TE ET NG OF AL DE SE LE SA SI AR VE RA LD UR'.split(' '));

export function chiSquared(text) {
  const counts = Array(26).fill(0);
  let n = 0;
  for (const c of text.toUpperCase()) { const i = c.charCodeAt(0) - 65; if (i >= 0 && i < 26) { counts[i]++; n++; } }
  if (!n) return Infinity;
  let chi = 0;
  for (let i = 0; i < 26; i++) { const e = ENGLISH[i] * n; chi += (counts[i] - e) ** 2 / e; }
  return chi;
}

// Higher is more English-like. Mixes letter frequencies, common bigrams and common words.
export function englishScore(text) {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  const n = letters.length;
  if (!n) return -Infinity;
  const chi = chiSquared(letters) / n;
  let bi = 0;
  for (let i = 0; i + 1 < n; i++) if (BIGRAMS.has(letters.slice(i, i + 2))) bi++;
  const words = text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  const hits = words.filter(w => COMMON.has(w)).length;
  const wordFrac = words.length ? hits / words.length : 0;
  return -chi + 2.5 * wordFrac + 3 * (n > 1 ? bi / (n - 1) : 0);
}

// Index of coincidence of a letter string (English ≈ 0.066, random ≈ 0.038).
export function ioc(s) {
  const counts = Array(26).fill(0);
  for (const c of s) counts[c.charCodeAt(0) - 65]++;
  const n = s.length;
  if (n < 2) return 0;
  return counts.reduce((a, f) => a + f * (f - 1), 0) / (n * (n - 1));
}

// Kasiski: distances between repeated trigrams; returns [[length, votes]] best first.
export function kasiski(letters, maxLen = 20) {
  const seen = {}, votes = Array(maxLen + 1).fill(0);
  for (let i = 0; i + 3 <= letters.length; i++) {
    const t = letters.slice(i, i + 3);
    if (seen[t] != null) {
      const d = i - seen[t];
      for (let L = 2; L <= maxLen; L++) if (d % L === 0) votes[L]++;
    }
    seen[t] = i;
  }
  return votes.map((v, L) => [L, v]).slice(2).filter(x => x[1]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

// Shortest repeating unit of a key: LEMONLEMON → LEMON.
function minimalKey(k) {
  for (let L = 1; L <= k.length; L++) if (k.length % L === 0 && k.slice(0, L).repeat(k.length / L) === k) return k.slice(0, L);
  return k;
}

// Guess Vigenère key lengths by index of coincidence (plus Kasiski votes), then solve
// each column as a Caesar shift by chi-squared.
export function crackVigenere(text, maxLen = 16) {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length < 20) return { lengths: [], candidates: [] };
  const top = Math.min(maxLen, Math.floor(letters.length / 4));
  const lengths = [];
  for (let L = 1; L <= top; L++) {
    let sum = 0;
    for (let c = 0; c < L; c++) { let col = ''; for (let i = c; i < letters.length; i += L) col += letters[i]; sum += ioc(col); }
    lengths.push({ L, ioc: sum / L });
  }
  const kas = kasiski(letters, top);
  const best = Math.max(...lengths.map(x => x.ioc));
  // Multiples of the true length score as well, so prefer the shortest one that is close to the best.
  const tryLens = new Set([
    ...lengths.filter(x => x.ioc >= best * 0.9).map(x => x.L).slice(0, 3),
    ...[...lengths].sort((a, b) => b.ioc - a.ioc).slice(0, 3).map(x => x.L),
    ...kas.slice(0, 2).map(x => x[0]),
  ]);
  const candidates = [];
  for (const L of tryLens) {
    let key = '';
    for (let c = 0; c < L; c++) {
      let col = '';
      for (let i = c; i < letters.length; i += L) col += letters[i];
      let bestS = 0, bestChi = Infinity;
      for (let s = 0; s < 26; s++) {
        const chi = chiSquared(caesar(col, -s));
        if (chi < bestChi) { bestChi = chi; bestS = s; }
      }
      key += A[bestS];
    }
    key = minimalKey(key);
    const plain = vigenere(text, key, true);
    if (!candidates.some(c => c.key === key)) candidates.push({ method: 'Vigenère', params: `key ${key}`, key, text: plain, score: englishScore(plain) });
  }
  return { lengths, kasiski: kas.slice(0, 5), candidates };
}

// Try everything cheap and rank by englishScore. Returns the best `limit` candidates.
export function autoCrack(text, limit = 8) {
  const out = [];
  const add = (method, params, plain, set) => out.push({ method, params, text: plain, score: englishScore(plain), set });
  const hasLetters = /[A-Za-z]/.test(text);
  if (hasLetters) {
    for (let s = 1; s < 26; s++) add(s === 13 ? 'ROT13' : 'Caesar', `shift ${s}`, caesar(text, -s), { method: 'caesar', shift: s });
    add('Atbash', '', atbash(text), { method: 'atbash' });
    for (const a of AFFINE_A.slice(1)) for (let b = 0; b < 26; b++) add('Affine', `a=${a}, b=${b}`, affine(text, a, b, true), { method: 'affine', a, b });
    const vig = crackVigenere(text);
    for (const c of vig.candidates) out.push({ ...c, set: { method: 'vigenere', key: c.key } });
  }
  const len = [...text].length;
  for (let r = 2; r <= Math.min(12, len - 1); r++) add('Rail fence', `${r} rails`, railFence(text, r, true), { method: 'rail', rails: r });
  if (/[!-~]/.test(text)) add('ROT47', '', rot47(text), { method: 'rot47' });
  if (/^[\sABab/]+$/.test(text) && text.replace(/[^ABab]/g, '').length >= 5) {
    add('Bacon (24)', '', baconDecode(text), { method: 'bacon' });
    add('Bacon (26)', '', baconDecode(text, true), { method: 'bacon', full26: true });
  }
  if (/^[\d\s\-/,.]+$/.test(text) && /\d/.test(text)) add('A1Z26', '', a1z26Decode(text), { method: 'a1z26' });
  add('As it is', '', text, null);
  out.sort((x, y) => y.score - x.score);
  const seen = new Set();
  return out.filter(c => !seen.has(c.text) && seen.add(c.text)).slice(0, limit);
}
