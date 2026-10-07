// Request builder: one request description ⇄ cURL, fetch(), HTTPie, Python requests, PHP.
// A request is:
//   { method, url, params: [[k, v]], headers: [[k, v]], bodyType: 'none'|'json'|'form'|'multipart'|'raw',
//     body: string, form: [[k, v]], auth: { type: 'none'|'bearer'|'basic', token, user, pass } }

const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64 = s => { try { return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); } catch { return null; } };

export const emptyRequest = () => ({ method: 'GET', url: '', params: [], headers: [], bodyType: 'none', body: '', form: [], auth: { type: 'none', token: '', user: '', pass: '' } });

// --- shell words -----------------------------------------------------------------
// Splits a command line the way bash would (quotes, backslashes, $'…'), and joins
// lines continued with a trailing \ (or ^ from Windows cmd).
export function shellWords(src) {
  const s = src.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  const words = [];
  let cur = null, i = 0;
  const push = () => { if (cur != null) words.push(cur); cur = null; };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { push(); i++; continue; }
    cur ??= '';
    if (c === "'") { const j = s.indexOf("'", i + 1); cur += s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1; continue; }
    if (c === '$' && s[i + 1] === "'") {
      i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < s.length) {
          const e = s[i + 1];
          const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' };
          if (e === 'x') { cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16)); i += 4; continue; }
          if (e === 'u') { cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue; }
          cur += map[e] ?? e; i += 2; continue;
        }
        cur += s[i++];
      }
      i++; continue;
    }
    if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && '"\\$`\n'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; continue; }
        cur += s[i++];
      }
      i++; continue;
    }
    if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 2; continue; }
    cur += c; i++;
  }
  push();
  return words;
}

// --- cURL → request --------------------------------------------------------------
const NO_ARG = new Set('-s -S -L -k -v -i -f -g -N -#  --silent --show-error --location --insecure --verbose --include --fail --globoff --no-buffer --compressed --http1.1 --http2 --http2-prior-knowledge --http3 --progress-bar --location-trusted --no-progress-meter --fail-with-body --raw --tcp-nodelay --ssl-reqd'.split(/\s+/));
const IGNORED_ARG = new Set('-o --output -m --max-time --connect-timeout -x --proxy --retry --retry-delay -w --write-out -c --cookie-jar -E --cert --key --cacert --resolve --limit-rate -r --range -T --upload-file --interface --max-redirs -K --config -y -Y --speed-time --speed-limit'.split(' '));

export function parseCurl(src) {
  const words = shellWords(src.trim());
  const notes = [];
  if (!words.length) throw new Error('Paste a curl command first.');
  if (words[0].toLowerCase() !== 'curl' && !/(^|\/)curl(\.exe)?$/i.test(words[0])) throw new Error('That does not start with “curl”.');
  const req = emptyRequest();
  let method = null, url = null, getMode = false, head = false;
  const data = [], form = [];
  const headers = [];
  for (let i = 1; i < words.length; i++) {
    let w = words[i];
    let val = null;
    // --flag=value
    if (w.startsWith('--') && w.includes('=')) { val = w.slice(w.indexOf('=') + 1); w = w.slice(0, w.indexOf('=')); }
    const next = () => val ?? words[++i] ?? '';
    // Attached short values: -XPOST, -HFoo:bar, -dname=x
    if (/^-[XHdFuAebm]./.test(w) && !w.startsWith('--')) { val = w.slice(2); w = w.slice(0, 2); }
    // Bundled short flags: -sSL
    if (/^-[a-zA-Z]{2,}$/.test(w) && [...w.slice(1)].every(c => NO_ARG.has('-' + c) || c === 'G' || c === 'I')) {
      for (const c of w.slice(1)) { if (c === 'G') getMode = true; if (c === 'I') head = true; }
      continue;
    }
    switch (w) {
      case '-X': case '--request': method = next().toUpperCase(); break;
      case '-H': case '--header': {
        const hv = next(); const k = hv.indexOf(':');
        if (k > 0) headers.push([hv.slice(0, k).trim(), hv.slice(k + 1).trim()]);
        break;
      }
      case '-d': case '--data': case '--data-ascii': case '--data-binary': case '--data-raw': {
        const v = next();
        if (v.startsWith('@') && w !== '--data-raw') notes.push(`The body was read from a file (${v}) — that file is not here, so paste its contents in.`);
        data.push(v); break;
      }
      case '--data-urlencode': {
        const v = next(); const eq = v.indexOf('=');
        data.push(eq > 0 ? v.slice(0, eq) + '=' + encodeURIComponent(v.slice(eq + 1)) : encodeURIComponent(v.startsWith('=') ? v.slice(1) : v));
        break;
      }
      case '--json': data.push(next()); headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json']); break;
      case '-F': case '--form': case '--form-string': {
        const v = next(); const eq = v.indexOf('=');
        if (eq > 0) form.push([v.slice(0, eq), v.slice(eq + 1)]);
        if (/=[@<]/.test(v)) notes.push(`“${v}” uploads a file — files cannot be attached here; it is kept as text.`);
        break;
      }
      case '-u': case '--user': {
        const v = next(); const k = v.indexOf(':');
        req.auth = { type: 'basic', token: '', user: k < 0 ? v : v.slice(0, k), pass: k < 0 ? '' : v.slice(k + 1) };
        break;
      }
      case '-A': case '--user-agent': headers.push(['User-Agent', next()]); break;
      case '-e': case '--referer': headers.push(['Referer', next()]); break;
      case '-b': case '--cookie': headers.push(['Cookie', next()]); break;
      case '-G': case '--get': getMode = true; break;
      case '-I': case '--head': head = true; break;
      case '--url': url = next(); break;
      case '--oauth2-bearer': req.auth = { type: 'bearer', token: next(), user: '', pass: '' }; break;
      default:
        if (NO_ARG.has(w)) break;
        if (IGNORED_ARG.has(w)) { next(); notes.push(`Ignored ${w} (not part of the request itself).`); break; }
        if (w.startsWith('-') && w.length > 1) { notes.push(`Did not understand ${w} — skipped.`); break; }
        if (url == null) url = w; else notes.push(`Extra word “${w}” skipped.`);
    }
  }
  if (!url) throw new Error('No URL found in that command.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url;

  let body = data.join('&');
  if (getMode && body) { url += (url.includes('?') ? '&' : '?') + body; body = ''; }
  req.method = method || (head ? 'HEAD' : (body || form.length) ? 'POST' : 'GET');

  // URL → base + params table.
  const q = url.indexOf('?');
  const hash = url.indexOf('#');
  const base = q < 0 ? url : url.slice(0, q);
  const query = q < 0 ? '' : url.slice(q + 1, hash > q ? hash : undefined);
  req.url = base;
  req.params = query ? query.split('&').filter(Boolean).map(p => {
    const e = p.indexOf('=');
    const dec = x => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } };
    return e < 0 ? [dec(p), ''] : [dec(p.slice(0, e)), dec(p.slice(e + 1))];
  }) : [];

  // Authorization header → auth section.
  let ctype = '';
  for (const [k, v] of headers) {
    const lk = k.toLowerCase();
    if (lk === 'authorization' && /^bearer\s+/i.test(v)) { req.auth = { type: 'bearer', token: v.replace(/^bearer\s+/i, ''), user: '', pass: '' }; continue; }
    if (lk === 'authorization' && /^basic\s+/i.test(v)) {
      const dec = unb64(v.replace(/^basic\s+/i, '').trim());
      if (dec != null && dec.includes(':')) { const k2 = dec.indexOf(':'); req.auth = { type: 'basic', token: '', user: dec.slice(0, k2), pass: dec.slice(k2 + 1) }; continue; }
    }
    if (lk === 'content-type') ctype = v.toLowerCase();
    if (req.headers.some(([a, b]) => a.toLowerCase() === lk && b === v)) continue;
    req.headers.push([k, v]);
  }

  if (form.length) { req.bodyType = 'multipart'; req.form = form; }
  else if (body) {
    const looksJson = /^\s*[[{]/.test(body);
    if (ctype.includes('json') || (!ctype && looksJson)) {
      req.bodyType = 'json'; req.body = body;
      if (!ctype) notes.push('The body looks like JSON, so it is sent as JSON (curl itself would have sent it as a form).');
    } else if (ctype.includes('x-www-form-urlencoded') || (!ctype && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body))) {
      req.bodyType = 'form';
      req.form = body.split('&').map(p => { const e = p.indexOf('='); const d = x => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } }; return e < 0 ? [d(p), ''] : [d(p.slice(0, e)), d(p.slice(e + 1))]; });
    } else { req.bodyType = 'raw'; req.body = body; }
  }
  // The body type implies Content-Type, so drop a matching header to avoid saying it twice.
  if (req.bodyType === 'json') req.headers = req.headers.filter(([k, v]) => !(k.toLowerCase() === 'content-type' && /application\/json/i.test(v)));
  if (req.bodyType === 'form') req.headers = req.headers.filter(([k, v]) => !(k.toLowerCase() === 'content-type' && /x-www-form-urlencoded/i.test(v)));
  return { req, notes };
}

// --- request → code ----------------------------------------------------------------
const encQ = s => encodeURIComponent(s).replace(/%20/g, '+');
export function fullUrl(req) {
  const ps = req.params.filter(([k]) => k !== '');
  if (!ps.length) return req.url;
  return req.url + (req.url.includes('?') ? '&' : '?') + ps.map(([k, v]) => encQ(k) + '=' + encQ(v)).join('&');
}
const formBody = req => req.form.filter(([k]) => k !== '').map(([k, v]) => encQ(k) + '=' + encQ(v)).join('&');

// Headers as they go on the wire, auth and content type included.
export function allHeaders(req, { auth = true } = {}) {
  const hs = req.headers.filter(([k]) => k.trim() !== '');
  const has = n => hs.some(([k]) => k.toLowerCase() === n);
  const out = [...hs];
  if (req.bodyType === 'json' && !has('content-type')) out.unshift(['Content-Type', 'application/json']);
  if (req.bodyType === 'form' && !has('content-type')) out.unshift(['Content-Type', 'application/x-www-form-urlencoded']);
  if (auth && req.auth.type === 'bearer' && req.auth.token) out.push(['Authorization', 'Bearer ' + req.auth.token]);
  if (auth && req.auth.type === 'basic' && (req.auth.user || req.auth.pass)) out.push(['Authorization', 'Basic ' + b64(req.auth.user + ':' + req.auth.pass)]);
  return out;
}
const bodyText = req => req.bodyType === 'json' || req.bodyType === 'raw' ? req.body : req.bodyType === 'form' ? formBody(req) : '';
const hasBody = req => req.bodyType !== 'none' && (req.bodyType === 'multipart' ? req.form.some(([k]) => k) : bodyText(req) !== '');
const parseJson = s => { try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; } };

const sh = s => /^[A-Za-z0-9_\-./:=@,+%]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`;

export function toCurl(req) {
  const parts = ['curl'];
  if (req.method === 'HEAD') parts.push('-I');
  else if (req.method !== 'GET' || hasBody(req)) parts.push('-X ' + req.method);
  parts.push(sh(fullUrl(req)));
  for (const [k, v] of allHeaders(req, { auth: false })) parts.push('-H ' + sh(`${k}: ${v}`));
  if (req.auth.type === 'bearer' && req.auth.token) parts.push('-H ' + sh('Authorization: Bearer ' + req.auth.token));
  if (req.auth.type === 'basic' && (req.auth.user || req.auth.pass)) parts.push('-u ' + sh(req.auth.user + ':' + req.auth.pass));
  if (hasBody(req)) {
    if (req.bodyType === 'multipart') for (const [k, v] of req.form.filter(([k]) => k)) parts.push('-F ' + sh(`${k}=${v}`));
    else parts.push('--data-raw ' + sh(bodyText(req)));
  }
  const head = parts.indexOf(sh(fullUrl(req))) + 1;
  const rest = parts.slice(head);
  return parts.slice(0, head).join(' ') + (rest.length ? ' \\\n  ' + rest.join(' \\\n  ') : '');
}

const js = s => JSON.stringify(s);
const indent = (s, n) => s.split('\n').map((l, i) => i ? ' '.repeat(n) + l : l).join('\n');

export function toFetch(req) {
  const hs = allHeaders(req);
  const lines = [];
  const opts = [`  method: ${js(req.method)},`];
  if (hs.length) opts.push('  headers: {\n' + hs.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n') + '\n  },');
  if (hasBody(req)) {
    if (req.bodyType === 'json') {
      const p = parseJson(req.body);
      opts.push(p.ok ? `  body: JSON.stringify(${indent(JSON.stringify(p.v, null, 2), 2)}),` : `  body: ${js(req.body)},`);
    } else if (req.bodyType === 'form') opts.push(`  body: new URLSearchParams(${indent(JSON.stringify(Object.fromEntries(req.form.filter(([k]) => k)), null, 2), 2)}),`);
    else if (req.bodyType === 'multipart') {
      lines.push('const form = new FormData();', ...req.form.filter(([k]) => k).map(([k, v]) => `form.append(${js(k)}, ${js(v)});`), '');
      opts.push('  body: form,');
    } else opts.push(`  body: ${js(req.body)},`);
  }
  lines.push(`const res = await fetch(${js(fullUrl(req))}, {`, ...opts, '});', 'console.log(res.status);', 'const text = await res.text();', 'console.log(text);');
  return lines.join('\n');
}

export function toHttpie(req) {
  const parts = ['http'];
  if (req.bodyType === 'form') parts.push('--form');
  if (req.bodyType === 'multipart') parts.push('--multipart');
  if (req.auth.type === 'basic' && (req.auth.user || req.auth.pass)) parts.push('-a ' + sh(req.auth.user + ':' + req.auth.pass));
  if (req.auth.type === 'bearer' && req.auth.token) parts.push('-A bearer -a ' + sh(req.auth.token));
  parts.push(req.method, sh(req.url));
  for (const [k, v] of req.params.filter(([k]) => k)) parts.push(sh(`${k}==${v}`));
  for (const [k, v] of allHeaders(req, { auth: false })) {
    if ((req.bodyType === 'form' || req.bodyType === 'multipart') && k.toLowerCase() === 'content-type') continue;
    parts.push(sh(`${k}:${v}`));
  }
  if (hasBody(req)) {
    if (req.bodyType === 'form' || req.bodyType === 'multipart') for (const [k, v] of req.form.filter(([k]) => k)) parts.push(sh(`${k}=${v}`));
    else parts.push('--raw ' + sh(req.body));
  }
  const head = parts.indexOf(sh(req.url)) + 1;
  const rest = parts.slice(head);
  return parts.slice(0, head).join(' ') + (rest.length ? ' \\\n  ' + rest.join(' \\\n  ') : '');
}

// JSON value → Python literal.
function py(v, d = 0) {
  const pad = '    '.repeat(d + 1), end = '    '.repeat(d);
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => pad + py(x, d + 1)).join(',\n') + ',\n' + end + ']' : '[]';
  const e = Object.entries(v);
  return e.length ? '{\n' + e.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${py(x, d + 1)}`).join(',\n') + ',\n' + end + '}' : '{}';
}

export function toPython(req) {
  const L = ['import requests', '', `url = ${js(req.url)}`];
  const args = ['url'];
  const ps = req.params.filter(([k]) => k);
  if (ps.length) { L.push('params = ' + py(Object.fromEntries(ps))); args.push('params=params'); }
  const hs = allHeaders(req, { auth: false }).filter(([k]) => !(req.bodyType === 'json' && k.toLowerCase() === 'content-type'));
  if (req.auth.type === 'bearer' && req.auth.token) hs.push(['Authorization', 'Bearer ' + req.auth.token]);
  if (hs.length) { L.push('headers = ' + py(Object.fromEntries(hs))); args.push('headers=headers'); }
  if (hasBody(req)) {
    if (req.bodyType === 'json') {
      const p = parseJson(req.body);
      if (p.ok) { L.push('payload = ' + py(p.v)); args.push('json=payload'); }
      else { L.push('data = ' + js(req.body)); args.push('data=data.encode()'); }
    } else if (req.bodyType === 'form') { L.push('data = ' + py(Object.fromEntries(req.form.filter(([k]) => k)))); args.push('data=data'); }
    else if (req.bodyType === 'multipart') { L.push('files = ' + py(Object.fromEntries(req.form.filter(([k]) => k).map(([k, v]) => [k, [null, v]]))).replace(/\[\n\s+None,\n\s+("(?:[^"\\]|\\.)*"),\n\s+\]/g, '(None, $1)')); args.push('files=files'); }
    else { L.push('data = ' + js(req.body)); args.push('data=data.encode()'); }
  }
  if (req.auth.type === 'basic' && (req.auth.user || req.auth.pass)) args.push(`auth=(${js(req.auth.user)}, ${js(req.auth.pass)})`);
  const m = req.method.toLowerCase();
  const call = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(m) ? `requests.${m}(` : `requests.request(${js(req.method)}, `;
  L.push('', `response = ${call}${args.join(', ')})`, 'print(response.status_code)', 'print(response.text)');
  return L.join('\n');
}

const php = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export function toPhp(req) {
  const o = [`    CURLOPT_URL => ${php(fullUrl(req))},`, '    CURLOPT_RETURNTRANSFER => true,'];
  if (req.method === 'HEAD') o.push('    CURLOPT_NOBODY => true,');
  else if (req.method !== 'GET') o.push(`    CURLOPT_CUSTOMREQUEST => ${php(req.method)},`);
  const hs = allHeaders(req, { auth: false });
  if (req.auth.type === 'bearer' && req.auth.token) hs.push(['Authorization', 'Bearer ' + req.auth.token]);
  if (hs.length) o.push('    CURLOPT_HTTPHEADER => [\n' + hs.map(([k, v]) => `        ${php(`${k}: ${v}`)},`).join('\n') + '\n    ],');
  if (hasBody(req)) {
    if (req.bodyType === 'multipart') o.push('    CURLOPT_POSTFIELDS => [\n' + req.form.filter(([k]) => k).map(([k, v]) => `        ${php(k)} => ${php(v)},`).join('\n') + '\n    ],');
    else o.push(`    CURLOPT_POSTFIELDS => ${php(bodyText(req))},`);
  }
  if (req.auth.type === 'basic' && (req.auth.user || req.auth.pass)) o.push(`    CURLOPT_USERPWD => ${php(req.auth.user + ':' + req.auth.pass)},`);
  return ['<?php', '$ch = curl_init();', 'curl_setopt_array($ch, [', ...o, ']);', '$response = curl_exec($ch);', '$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);', 'curl_close($ch);', '', 'echo $status . PHP_EOL . $response;'].join('\n');
}

export const GENERATORS = [['curl', 'cURL', toCurl], ['fetch', 'fetch()', toFetch], ['httpie', 'HTTPie', toHttpie], ['python', 'Python', toPython], ['php', 'PHP', toPhp]];
