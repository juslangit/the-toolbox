import { h, field, input, output, note, row, card, on } from '../ui.js';
import { md5 } from '../../vendor/md5.js';

// --- password strength ----------------------------------------------------
// A small, honest estimator: pool size × length, then penalties for the
// patterns attackers try first. Not zxcvbn, but it catches the usual mistakes.
const COMMON = ('123456 password 123456789 12345678 12345 qwerty 1234567 111111 123123 abc123 password1 1234 iloveyou 1q2w3e4r 000000 qwerty123 zaq12wsx dragon sunshine princess letmein 654321 monkey 27653 1qaz2wsx 123321 qwertyuiop superman asdfghjkl trustno1 football baseball welcome admin login master hello freedom whatever shadow michael jesus ninja mustang access passw0rd starwars 696969 batman 7777777 secret qazwsx charlie aa123456 donald password123 loveme 121212 flower hottie zxcvbnm 123qwe computer azerty nicole daniel jordan hunter ranger buster soccer harley andrew tigger summer pepper ginger killer test test123 changeme default root toor guest user abcd1234 malaysia sayang cinta rahsia kucing').split(' ');
const SEQS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function analyse(pw) {
  const warn = [];
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const chars = [...pw];
  let bits = chars.length * Math.log2(Math.max(pool, 1));

  // Passphrases: attackers guess whole words, not letters. A word from a big
  // list is worth about 13 bits, whatever its length.
  const words = pw.split(/[\s\-_.,+]+/).filter(w => /^[A-Za-z]{3,}\d*$/.test(w));
  if (words.length >= 3) {
    const extra = [...pw.replace(/[A-Za-z]/g, '')].length * 3;
    bits = Math.min(bits, words.length * 13 + extra);
  }

  const lower = pw.toLowerCase();
  const unleet = lower.replace(/[013457@$!]/g, c => LEET[c]);
  if (COMMON.includes(lower) || COMMON.includes(unleet) || COMMON.includes(lower.replace(/\d+$/, ''))) {
    bits = Math.min(bits, 10);
    warn.push('This is one of the most common passwords — it is guessed in seconds.');
  }
  if (/(.)\1{2,}/.test(pw)) { bits -= 8; warn.push('Repeated characters (like “aaa”) add almost nothing.'); }
  for (const s of SEQS) {
    for (let i = 0; i + 4 <= s.length; i++) {
      const piece = s.slice(i, i + 4);
      if (lower.includes(piece) || lower.includes([...piece].reverse().join(''))) {
        bits -= 10; warn.push(`Keyboard or alphabet runs like “${piece}” are tried early.`); break;
      }
    }
  }
  if (/(19|20)\d\d/.test(pw)) { bits -= 6; warn.push('Years are among the first things attackers try.'); }
  if (/^[A-Z][a-z]+\d+[^A-Za-z0-9]?$/.test(pw)) { bits -= 10; warn.push('“Word + numbers + symbol” is the most predictable shape.'); }
  if (chars.length < 12) warn.push('Use at least 12 characters — length beats complexity.');
  if (pool && pool <= 26 && chars.length < 16) warn.push('Only one kind of character. Mix in others, or make it much longer.');
  return { bits: Math.max(0, Math.round(bits)), warn };
}

const YEAR = 31557600;
function duration(sec) {
  if (sec < 1) return 'instantly';
  const say = (n, unit) => { const r = Math.round(n); return `${r.toLocaleString()} ${unit}${r === 1 ? '' : 's'}`; };
  if (sec < 60) return say(sec, 'second');
  if (sec < 3600) return say(sec / 60, 'minute');
  if (sec < 86400) return say(sec / 3600, 'hour');
  if (sec < YEAR) return say(sec / 86400, 'day');
  if (sec < YEAR * 1e6) return say(sec / YEAR, 'year');
  if (sec < YEAR * 1.4e10) return `${Math.round(sec / YEAR / 1e6).toLocaleString()} million years`;
  return 'longer than the universe has existed';
}

const strength = {
  keep: false,
  id: 'strength', name: 'Password strength', group: 'crypto', icon: 'shield-alert',
  desc: 'How long a password would take to crack, and what makes it weak.',
  keywords: 'password strength check entropy crack time secure',
  render(root) {
    const pw = h('input', { class: 'input mono', type: 'password', placeholder: 'Type a password', autocomplete: 'off', spellcheck: false });
    const show = h('button', { class: 'btn small', type: 'button', onclick: () => { pw.type = pw.type === 'password' ? 'text' : 'password'; show.textContent = pw.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
    const meter = h('div', { class: 'meter big' }, h('i'));
    const verdict = h('div', { class: 'verdict' });
    const facts = h('dl', { class: 'kv' });
    const tips = h('ul', { class: 'tips' });
    function run() {
      facts.replaceChildren(); tips.replaceChildren();
      if (!pw.value) { verdict.textContent = ''; meter.firstChild.style.width = '0'; return; }
      const { bits, warn } = analyse(pw.value);
      const level = bits < 35 ? 'weak' : bits < 60 ? 'ok' : 'strong';
      meter.dataset.level = level;
      meter.firstChild.style.width = Math.min(100, bits / 1.1) + '%';
      verdict.textContent = { weak: '✗ Weak', ok: '~ Fair', strong: '✓ Strong' }[level];
      verdict.className = 'verdict ' + (level === 'strong' ? 'good' : level === 'weak' ? 'bad' : '');
      const guesses = 2 ** bits / 2;
      facts.append(
        h('dt', {}, 'Strength'), h('dd', {}, `about ${bits} bits`),
        h('dt', {}, 'Stolen database, fast hash'), h('dd', {}, duration(guesses / 1e10) + ' (10 billion guesses a second)'),
        h('dt', {}, 'Stolen database, bcrypt'), h('dd', {}, duration(guesses / 1e4) + ' (10,000 a second)'),
        h('dt', {}, 'Guessing on a login page'), h('dd', {}, duration(guesses / 10) + ' (10 a second)'));
      tips.append(...warn.map(w => h('li', {}, w)));
      if (!warn.length) tips.append(h('li', {}, 'No obvious patterns found.'));
    }
    root.append(
      card(h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, 'Password'), show), pw),
        meter, verdict, facts),
      card(h('h3', {}, 'What to fix'), tips),
      h('p', { class: 'field-hint' }, 'Checked on this device only. Estimates assume the attacker knows common patterns; real cracking tools are smarter still, so treat “strong” as a floor.'));
    on(pw, run);
  },
};

// --- file checksum ----------------------------------------------------------
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

const checksum = {
  id: 'checksum', name: 'File checksum', group: 'crypto', icon: 'file-check',
  desc: 'SHA-256, SHA-1, SHA-512 and MD5 of a file — check a download is genuine.',
  keywords: 'checksum file hash sha256 md5 verify download integrity',
  accepts: ['file'],
  render(root, incoming) {
    const drop = h('label', { class: 'drop' }, h('input', { type: 'file', hidden: true }), h('span', {}, 'Drop a file here, or tap to choose one'));
    const info = note();
    const expect = input({ mono: true, placeholder: 'Paste the checksum from the download page' });
    const verdict = h('div', { class: 'verdict' });
    const algos = ['SHA-256', 'SHA-1', 'SHA-512', 'MD5'];
    const outs = Object.fromEntries(algos.map(a => [a, output(a)]));
    const results = {};
    function compare() {
      const want = expect.value.trim().toLowerCase().replace(/^[a-z0-9-]+[:=]\s*/, '');
      for (const a of algos) outs[a].el.classList.toggle('hit', !!want && results[a] === want);
      if (!want || !results['SHA-256']) { verdict.textContent = ''; verdict.className = 'verdict'; return; }
      const hit = algos.find(a => results[a] === want);
      verdict.textContent = hit ? `✓ Matches the ${hit} — the file is what it claims to be` : '✗ No match — do not trust this file';
      verdict.className = 'verdict ' + (hit ? 'good' : 'bad');
    }
    async function read(f) {
      if (!f) return;
      info.info(`Reading ${f.name}…`);
      const t = performance.now();
      const buf = await f.arrayBuffer();
      for (const a of algos) {
        results[a] = a === 'MD5' ? md5(buf) : toHex(await crypto.subtle.digest(a, buf));
        outs[a].set(results[a]);
      }
      info.info(`${f.name} — ${f.size.toLocaleString()} bytes, hashed in ${Math.round(performance.now() - t)} ms`);
      compare();
    }
    drop.querySelector('input').addEventListener('change', e => read(e.target.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); read(e.dataTransfer.files[0]); });
    root.append(card(drop, info.el), card(field('Expected checksum (optional)', expect), verdict), card(...algos.map(a => outs[a].el)));
    on(expect, compare);
    if (incoming?.files?.[0]) read(incoming.files[0]);
  },
};

export default [strength, checksum];
export { analyse };
