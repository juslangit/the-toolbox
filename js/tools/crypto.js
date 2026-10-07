import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, copyBtn } from '../ui.js';
import { md5 } from '../../vendor/md5.js';
import bcrypt from '../../vendor/bcryptjs.js';

// Uniform random integer in [0, n) with no modulo bias.
function randInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hexToB64 = hex => btoa(hex.match(/../g).map(x => String.fromCharCode(parseInt(x, 16))).join(''));

const token = {
  id: 'token', name: 'Token & password', group: 'crypto', icon: 'key-round',
  desc: 'Random passwords, API tokens and secrets, made on this device.',
  keywords: 'password generator random secret api key string',
  render(root) {
    const len = input({ type: 'range', min: 4, max: 128, value: 32 });
    const lenLabel = h('strong', {});
    const upper = checkbox('A–Z', true), lower = checkbox('a–z', true);
    const digits = checkbox('0–9', true), symbols = checkbox('Symbols', false);
    const noLook = checkbox('No look-alikes (0 O 1 l I)', false);
    const count = select([1, 5, 10, 20].map(String), '1');
    const out = output('Result', { multiline: true, rows: 3 });
    const strength = h('div', { class: 'meter' }, h('i'));
    const strengthLabel = h('span', { class: 'field-hint' });

    function gen() {
      let set = '';
      if (upper.input.checked) set += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (lower.input.checked) set += 'abcdefghijklmnopqrstuvwxyz';
      if (digits.input.checked) set += '0123456789';
      if (symbols.input.checked) set += '!@#$%^&*()-_=+[]{};:,.<>?/~';
      if (noLook.input.checked) set = set.replace(/[0O1lI]/g, '');
      lenLabel.textContent = len.value;
      if (!set) { out.set(''); return; }
      const n = +len.value;
      const lines = [];
      for (let k = 0; k < +count.value; k++) {
        let s = '';
        for (let i = 0; i < n; i++) s += set[randInt(set.length)];
        lines.push(s);
      }
      out.set(lines.join('\n'));
      out.input.rows = Math.min(10, Math.max(2, lines.length));
      const bits = Math.round(n * Math.log2(set.length));
      const pct = Math.min(100, bits / 1.28);
      strength.firstChild.style.width = pct + '%';
      strength.dataset.level = bits < 50 ? 'weak' : bits < 80 ? 'ok' : 'strong';
      strengthLabel.textContent = `${bits} bits of entropy — ${bits < 50 ? 'weak' : bits < 80 ? 'good' : 'very strong'}`;
    }
    root.append(card(
      field(h('span', {}, 'Length: ', lenLabel), len),
      h('div', { class: 'checks' }, upper, lower, digits, symbols, noLook),
      field('How many', count),
      out.el,
      strength, strengthLabel,
      row(h('button', { class: 'btn primary', type: 'button', onclick: gen }, 'Generate again')),
    ));
    on([len, count, upper.input, lower.input, digits.input, symbols.input, noLook.input], gen);
  },
};

const hash = {
  id: 'hash', name: 'Hash text', group: 'crypto', icon: 'hash',
  desc: 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 — with an optional HMAC key.',
  keywords: 'md5 sha1 sha256 sha512 hmac checksum digest',
  render(root) {
    const text = textarea({ placeholder: 'Text to hash…', rows: 4 });
    const key = input({ placeholder: 'Leave empty for a plain hash', mono: true });
    const enc = tabs([['hex', 'Hex'], ['b64', 'Base64']], 'hex', () => run());
    const algos = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    const outs = Object.fromEntries(algos.map(a => [a, output(a)]));
    const te = new TextEncoder();
    let seq = 0;

    async function run() {
      const my = ++seq;
      const data = te.encode(text.value);
      const k = key.value;
      const res = {};
      res['MD5'] = k ? md5.hmac(k, text.value) : md5(text.value);
      for (const a of algos.slice(1)) {
        let buf;
        if (k) {
          const ck = await crypto.subtle.importKey('raw', te.encode(k), { name: 'HMAC', hash: a }, false, ['sign']);
          buf = await crypto.subtle.sign('HMAC', ck, data);
        } else buf = await crypto.subtle.digest(a, data);
        res[a] = enc.value === 'hex' ? toHex(buf) : toB64(buf);
      }
      if (enc.value === 'b64') res['MD5'] = hexToB64(res['MD5']);
      if (my !== seq) return;
      for (const a of algos) outs[a].set(res[a]);
    }
    root.append(
      card(field('Text', text), field('HMAC key (optional)', key), field('Output', enc)),
      card(...algos.map(a => outs[a].el)),
    );
    on([text, key], run);
  },
};

const bcryptTool = {
  id: 'bcrypt', name: 'Bcrypt', group: 'crypto', icon: 'lock',
  desc: 'Hash a password with bcrypt, or check a password against a hash.',
  keywords: 'password hash compare verify salt rounds',
  render(root) {
    const pw = input({ placeholder: 'Password', mono: true });
    const rounds = input({ type: 'number', value: 10, min: 4, max: 15 });
    const out = output('Hash');
    const status = note();
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Hash it');
    go.onclick = async () => {
      go.disabled = true; status.info('Hashing…');
      const t = performance.now();
      const r = Math.min(15, Math.max(4, +rounds.value || 10));
      out.set(await bcrypt.hash(pw.value, r));
      status.info(`Done in ${Math.round(performance.now() - t)} ms with cost ${r}.`);
      go.disabled = false;
    };

    const cpw = input({ placeholder: 'Password', mono: true });
    const chash = input({ placeholder: '$2a$10$…', mono: true });
    const verdict = h('div', { class: 'verdict' });
    async function check() {
      if (!cpw.value || !chash.value) { verdict.textContent = ''; verdict.className = 'verdict'; return; }
      try {
        const ok = await bcrypt.compare(cpw.value, chash.value.trim());
        verdict.textContent = ok ? '✓ Match' : '✗ No match';
        verdict.className = 'verdict ' + (ok ? 'good' : 'bad');
      } catch { verdict.textContent = 'That is not a bcrypt hash'; verdict.className = 'verdict bad'; }
    }
    root.append(
      card(h('h3', {}, 'Hash'), grid(field('Password', pw), field('Cost (rounds)', rounds, 'Each +1 doubles the time. 10–12 is normal.')), row(go), status.el, out.el),
      card(h('h3', {}, 'Check'), field('Password', cpw), field('Hash', chash), verdict),
    );
    on([cpw, chash], check);
  },
};

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, used by ULID
function ulid() {
  let t = Date.now(), time = '';
  for (let i = 0; i < 10; i++) { time = B32[t % 32] + time; t = Math.floor(t / 32); }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += B32[randInt(32)];
  return time + rand;
}
function uuidv7() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = toHex(b);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function nanoid(size = 21) {
  const a = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
  let s = '';
  for (let i = 0; i < size; i++) s += a[randInt(64)];
  return s;
}

const ids = {
  id: 'uuid', name: 'UUID & ULID', group: 'crypto', icon: 'fingerprint',
  desc: 'Unique IDs: UUID v4, time-ordered UUID v7, ULID and nanoid.',
  keywords: 'guid unique id identifier v4 v7 ulid nanoid',
  render(root) {
    const kind = tabs([['v4', 'UUID v4'], ['v7', 'UUID v7'], ['ulid', 'ULID'], ['nano', 'nanoid']], 'v4', () => gen());
    const count = select(['1', '5', '10', '50'], '1');
    const upper = checkbox('Uppercase'), noDash = checkbox('No dashes');
    const out = output('IDs', { multiline: true, rows: 2 });
    const about = h('p', { class: 'field-hint' });
    const blurb = {
      v4: 'Fully random. The everyday default.',
      v7: 'Starts with the time, so IDs sort in creation order — good as database keys.',
      ulid: '26 characters, sortable by time, no confusing letters.',
      nano: '21 URL-safe characters. Short and random.',
    };
    function gen() {
      const make = { v4: () => crypto.randomUUID(), v7: uuidv7, ulid, nano: () => nanoid() }[kind.value];
      let list = Array.from({ length: +count.value }, make);
      if (noDash.input.checked) list = list.map(s => s.replace(/-/g, ''));
      // ULIDs are uppercase by spec and nanoid is case-sensitive, so this is UUID-only.
      if (upper.input.checked && kind.value.startsWith('v')) list = list.map(s => s.toUpperCase());
      out.set(list.join('\n'));
      out.input.rows = Math.min(12, Math.max(2, list.length));
      about.textContent = blurb[kind.value];
    }
    root.append(card(
      kind, about,
      row(field('How many', count), h('div', { class: 'checks' }, upper, noDash)),
      out.el,
      row(h('button', { class: 'btn primary', type: 'button', onclick: gen }, 'Generate again')),
    ));
    on([count, upper.input, noDash.input], gen, 'change');
  },
};

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function ago(sec) {
  const d = Math.round(sec - Date.now() / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const a = Math.abs(d);
  if (a < 60) return rtf.format(d, 'second');
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  return rtf.format(Math.round(d / 86400), 'day');
}

const jwt = {
  id: 'jwt', name: 'JWT decoder', group: 'crypto', icon: 'ticket',
  desc: 'Read what is inside a JSON Web Token: header, claims and expiry.',
  keywords: 'json web token decode bearer supabase auth claims exp',
  render(root) {
    const tok = textarea({ placeholder: 'eyJhbGciOi…', rows: 4 });
    const err = note();
    const status = h('div', { class: 'verdict' });
    const head = output('Header', { multiline: true, rows: 5 });
    const body = output('Payload', { multiline: true, rows: 10 });
    const claims = h('dl', { class: 'kv' });
    const NAMES = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'Token ID', role: 'Role', email: 'Email' };
    function run() {
      claims.replaceChildren(); status.textContent = ''; status.className = 'verdict';
      const raw = tok.value.trim().replace(/^Bearer\s+/i, '');
      if (!raw) { head.set(''); body.set(''); err.clear(); return; }
      const parts = raw.split('.');
      try {
        if (parts.length < 2) throw new Error('A JWT has three parts separated by dots.');
        const hd = JSON.parse(b64urlDecode(parts[0]));
        const pl = JSON.parse(b64urlDecode(parts[1]));
        head.set(JSON.stringify(hd, null, 2));
        body.set(JSON.stringify(pl, null, 2));
        err.info('The signature is not checked — this only reads the token.');
        for (const [k, v] of Object.entries(pl)) {
          if (!NAMES[k]) continue;
          let val = typeof v === 'object' ? JSON.stringify(v) : String(v);
          if (['exp', 'nbf', 'iat'].includes(k) && typeof v === 'number')
            val = `${new Date(v * 1000).toLocaleString('en-GB')} (${ago(v)})`;
          claims.append(h('dt', {}, NAMES[k]), h('dd', {}, val));
        }
        if (typeof pl.exp === 'number') {
          const live = pl.exp * 1000 > Date.now();
          status.textContent = live ? `✓ Still valid — expires ${ago(pl.exp)}` : `✗ Expired ${ago(pl.exp)}`;
          status.className = 'verdict ' + (live ? 'good' : 'bad');
        }
      } catch (e) {
        head.set(''); body.set('');
        err.error(e instanceof SyntaxError ? 'That does not decode to JSON — is it a full token?' : e.message);
      }
    }
    root.append(card(field('Token', tok), err.el, status, claims), card(head.el, body.el));
    on(tok, run);
  },
};

export default [token, hash, bcryptTool, ids, jwt];
export { randInt };
