import { h, field, input, textarea, select, output, note, row, card, grid, tabs, on, copyBtn } from '../ui.js';
import yaml from '../../vendor/js-yaml.js';

// --- IPv4 subnet -------------------------------------------------------------
const ipToInt = ip => {
  const p = ip.trim().split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || +x > 255)) throw new Error(`“${ip}” is not an IPv4 address.`);
  return p.reduce((n, x) => n * 256 + +x, 0);
};
const intToIp = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');
const maskOf = bits => bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
function maskToBits(m) {
  const n = ipToInt(m);
  const bits = n.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bits)) throw new Error(`${m} is not a valid netmask.`);
  return bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
}
function kind(n) {
  const a = n >>> 24, b = (n >>> 16) & 255;
  if (a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)) return 'Private (RFC 1918)';
  if (a === 127) return 'Loopback';
  if (a === 169 && b === 254) return 'Link-local';
  if (a === 100 && b >= 64 && b < 128) return 'Carrier-grade NAT (RFC 6598)';
  if (a >= 224 && a < 240) return 'Multicast';
  if (a >= 240) return 'Reserved';
  if (a === 0) return '“This network”';
  return 'Public';
}
function subnet(text) {
  let [ip, suffix] = text.trim().split(/\s*[\/ ]\s*/);
  if (suffix === undefined) suffix = '32';
  const bits = /^\d+$/.test(suffix) ? +suffix : maskToBits(suffix);
  if (bits < 0 || bits > 32) throw new Error('The prefix must be between /0 and /32.');
  const addr = ipToInt(ip), mask = maskOf(bits);
  const net = (addr & mask) >>> 0, bcast = (net | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - bits);
  const usable = bits >= 31 ? total : total - 2;
  const first = bits >= 31 ? net : net + 1, last = bits >= 31 ? bcast : bcast - 1;
  const cls = (addr >>> 24) < 128 ? 'A' : (addr >>> 24) < 192 ? 'B' : (addr >>> 24) < 224 ? 'C' : (addr >>> 24) < 240 ? 'D' : 'E';
  return [
    ['Address', intToIp(addr)], ['CIDR', `${intToIp(net)}/${bits}`],
    ['Netmask', intToIp(mask)], ['Wildcard', intToIp(~mask >>> 0)],
    ['Network', intToIp(net)], ['Broadcast', bits >= 31 ? '— (none on /31 and /32)' : intToIp(bcast)],
    ['First host', intToIp(first)], ['Last host', intToIp(last)],
    ['Usable hosts', usable.toLocaleString()], ['Total addresses', total.toLocaleString()],
    ['Type', kind(addr)], ['Class (old style)', cls],
    ['Binary mask', mask.toString(2).padStart(32, '0').match(/.{8}/g).join('.')],
  ];
}

const subnetTool = {
  id: 'subnet', name: 'IPv4 subnet', group: 'dev', icon: 'network',
  desc: 'Network, broadcast, host range and mask for any IPv4 address and prefix.',
  keywords: 'ip ipv4 subnet cidr netmask network calculator range hosts mask',
  render(root) {
    const src = input({ mono: true, value: '192.168.1.42/24', placeholder: '10.0.0.5/16 or 10.0.0.5 255.255.0.0' });
    const err = note();
    const table = h('dl', { class: 'kv wide' });
    function run() {
      table.replaceChildren();
      try { table.append(...subnet(src.value).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])); err.clear(); }
      catch (e) { err.error(e.message); }
    }
    root.append(card(field('Address with prefix or netmask', src), err.el,
      h('div', { class: 'chips' }, ['/8', '/16', '/24', '/28', '/30', '/32'].map(p =>
        h('button', { class: 'chip', type: 'button', onclick: () => { src.value = src.value.split(/[\/ ]/)[0] + p; run(); } }, p)))),
      card(table));
    on(src, run);
  },
};

// --- docker run → compose --------------------------------------------------------
// Split a shell command into words: quotes, backslash escapes, line continuations.
function shellWords(s) {
  const out = [];
  let cur = '', inWord = false, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === '\\' && s[i + 1] === '\n') i++;
    else if (c === '\\' && i + 1 < s.length) { cur += s[++i]; inWord = true; }
    else if (c === '"' || c === "'") { q = c; inWord = true; }
    else if (/\s/.test(c)) { if (inWord) out.push(cur); cur = ''; inWord = false; }
    else { cur += c; inWord = true; }
  }
  if (q) throw new Error('A quote is never closed.');
  if (inWord) out.push(cur);
  return out;
}

// flag → [compose key, how to store]. 'list' appends, 'one' sets, 'true' sets true.
const OPTS = {
  '-p': ['ports', 'list'], '--publish': ['ports', 'list'],
  '-v': ['volumes', 'list'], '--volume': ['volumes', 'list'],
  '-e': ['environment', 'list'], '--env': ['environment', 'list'],
  '--env-file': ['env_file', 'list'], '--name': ['container_name', 'one'],
  '--restart': ['restart', 'one'], '-w': ['working_dir', 'one'], '--workdir': ['working_dir', 'one'],
  '-u': ['user', 'one'], '--user': ['user', 'one'], '-h': ['hostname', 'one'], '--hostname': ['hostname', 'one'],
  '--entrypoint': ['entrypoint', 'one'], '-l': ['labels', 'list'], '--label': ['labels', 'list'],
  '--add-host': ['extra_hosts', 'list'], '--cap-add': ['cap_add', 'list'], '--cap-drop': ['cap_drop', 'list'],
  '--device': ['devices', 'list'], '--dns': ['dns', 'list'], '--expose': ['expose', 'list'],
  '--tmpfs': ['tmpfs', 'list'], '--security-opt': ['security_opt', 'list'],
  '-m': ['mem_limit', 'one'], '--memory': ['mem_limit', 'one'], '--cpus': ['cpus', 'one'],
  '--shm-size': ['shm_size', 'one'], '--platform': ['platform', 'one'], '--pull': ['pull_policy', 'one'],
  '--stop-signal': ['stop_signal', 'one'], '--pid': ['pid', 'one'], '--ipc': ['ipc', 'one'],
  '--privileged': ['privileged', 'true'], '--init': ['init', 'true'], '--read-only': ['read_only', 'true'],
  '-t': ['tty', 'true'], '--tty': ['tty', 'true'], '-i': ['stdin_open', 'true'], '--interactive': ['stdin_open', 'true'],
};
const IGNORED_BOOL = { '-d': 'runs in the background — use “docker compose up -d”', '--detach': 'use “docker compose up -d”', '--rm': 'compose manages container removal itself' };
const SPECIAL_VALUE = ['--network', '--net', '--log-driver', '--log-opt', '--sysctl', '--ulimit', '--health-cmd', '--health-interval', '--health-retries', '--health-timeout', '--health-start-period', '--gpus', '--mount', '--ip', '--mac-address', '--cidfile', '--label-file', '--stop-timeout', '--memory-swap', '--cpu-shares', '--userns', '--uts', '--cgroupns', '--runtime', '--storage-opt', '--volumes-from', '--link', '--group-add', '--device-cgroup-rule', '--attach', '-a', '--blkio-weight', '--cpuset-cpus', '--oom-score-adj', '--domainname', '--dns-search', '--dns-option', '--publish-all'];

function dockerToCompose(cmd) {
  let w = shellWords(cmd);
  if (w[0] === 'sudo') w.shift();
  if (w[0] === 'docker') w.shift();
  if (w[0] === 'container') w.shift();
  if (w[0] === 'run') w.shift();
  else if (w.length && !w[0].startsWith('-')) {
    if (['create', 'exec', 'build', 'start'].includes(w[0])) throw new Error(`This converts “docker run”, not “docker ${w[0]}”.`);
  }
  const svc = {}, notes = [], top = {};
  const health = {};
  let image = null, command = [];
  const put = (key, how, val) => {
    if (how === 'list') (svc[key] ||= []).push(val);
    else if (how === 'true') svc[key] = true;
    else svc[key] = val;
  };
  for (let i = 0; i < w.length; i++) {
    let tok = w[i];
    if (image) { command.push(tok); continue; }
    if (!tok.startsWith('-') || tok === '-') { image = tok; continue; }
    let val = null;
    if (tok.startsWith('--') && tok.includes('=')) { [tok, val] = [tok.slice(0, tok.indexOf('=')), tok.slice(tok.indexOf('=') + 1)]; }
    // Bundled short flags: -dit → -d -i -t
    if (/^-[a-zA-Z]{2,}$/.test(tok) && [...tok.slice(1)].every(c => ['d', 'i', 't'].includes(c))) {
      for (const c of tok.slice(1)) {
        if (c === 'd') notes.push('-d: ' + IGNORED_BOOL['-d']);
        else put(...OPTS['-' + c]);
      }
      continue;
    }
    const takesValue = (OPTS[tok] && OPTS[tok][1] !== 'true') || SPECIAL_VALUE.includes(tok) && tok !== '--publish-all';
    if (takesValue && val === null) {
      val = w[++i];
      if (val === undefined) throw new Error(`${tok} needs a value.`);
    }
    if (OPTS[tok]) { const [k, how] = OPTS[tok]; put(k, how, how === 'true' ? true : val); continue; }
    if (IGNORED_BOOL[tok]) { notes.push(`${tok}: ${IGNORED_BOOL[tok]}`); continue; }
    switch (tok) {
      case '--network': case '--net':
        if (['host', 'none'].includes(val) || val.startsWith('container:')) svc.network_mode = val;
        else if (val !== 'bridge') { (svc.networks ||= []).push(val); (top.networks ||= {})[val] = { external: true }; }
        break;
      case '--log-driver': (svc.logging ||= {}).driver = val; break;
      case '--log-opt': { const [k, ...v] = val.split('='); ((svc.logging ||= {}).options ||= {})[k] = v.join('='); break; }
      case '--sysctl': { const [k, ...v] = val.split('='); (svc.sysctls ||= {})[k] = v.join('='); break; }
      case '--ulimit': { const [k, v] = val.split('='); const [soft, hard] = v.split(':').map(Number); (svc.ulimits ||= {})[k] = hard ? { soft, hard } : soft; break; }
      case '--health-cmd': health.test = ['CMD-SHELL', val]; break;
      case '--health-interval': health.interval = val; break;
      case '--health-timeout': health.timeout = val; break;
      case '--health-retries': health.retries = +val; break;
      case '--health-start-period': health.start_period = val; break;
      case '--gpus':
        svc.deploy = { resources: { reservations: { devices: [{ driver: 'nvidia', count: val === 'all' ? 'all' : +val.replace(/\D/g, '') || 'all', capabilities: ['gpu'] }] } } };
        break;
      case '--stop-timeout': svc.stop_grace_period = `${val}s`; break;
      case '--group-add': (svc.group_add ||= []).push(val); break;
      case '--dns-search': (svc.dns_search ||= []).push(val); break;
      case '--domainname': svc.domainname = val; break;
      case '--runtime': svc.runtime = val; break;
      case '--userns': svc.userns_mode = val; break;
      case '--ip': notes.push(`--ip ${val}: set it under the network's ipv4_address in compose`); break;
      default: notes.push(`${tok}${val !== null ? ' ' + val : ''}: not converted — add it by hand`);
    }
  }
  if (!image) throw new Error('No image found — the command needs an image name, e.g. nginx:latest.');
  if (Object.keys(health).length) svc.healthcheck = health;
  // Named volumes (not a path) need declaring at the top level.
  for (const v of svc.volumes || []) {
    const src = v.split(':')[0];
    if (v.includes(':') && !/^[./~$]/.test(src)) (top.volumes ||= {})[src] = {};
  }
  const name = (svc.container_name || image.split('/').pop().split(/[:@]/)[0]).replace(/[^a-zA-Z0-9_.-]/g, '-');
  const ordered = { image, ...svc };
  if (command.length) ordered.command = command.length === 1 ? command[0] : command;
  return { doc: { services: { [name]: ordered }, ...top }, notes };
}

const docker = {
  id: 'docker', name: 'docker run → compose', group: 'dev', icon: 'container',
  desc: 'Paste a docker run command, get the docker-compose.yml for it.',
  keywords: 'docker run compose yaml container convert docker-compose',
  render(root) {
    const src = textarea({ rows: 6, value: 'docker run -d --name n8n --restart unless-stopped \\\n  -p 5678:5678 -e TZ=Asia/Kuala_Lumpur \\\n  -v n8n_data:/home/node/.n8n n8nio/n8n:latest' });
    const out = output('docker-compose.yml', { multiline: true, rows: 16 });
    const err = note();
    const notes = h('ul', { class: 'tips' });
    function run() {
      notes.replaceChildren();
      if (!src.value.trim()) { out.set(''); err.clear(); return; }
      try {
        const { doc, notes: n } = dockerToCompose(src.value);
        out.set(yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' }));
        err.clear();
        notes.append(...n.map(x => h('li', {}, x)));
      } catch (e) { out.set(''); err.error(e.message); }
    }
    root.append(h('div', { class: 'grid2' },
      card(field('docker run command', src), err.el, notes),
      card(out.el)));
    on(src, run, 'input', 150);
  },
};

// --- user agent --------------------------------------------------------------------
const WIN = { '10.0': '10 or 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
function parseUA(ua) {
  const m = re => (ua.match(re) || [])[1];
  const r = {};
  const bot = ua.match(/([\w-]*(?:bot|crawler|spider|slurp)[\w-]*|curl|wget|python-requests|axios|Go-http-client|PostmanRuntime|HeadlessChrome)/i);
  if (bot) r.Bot = bot[1];
  // Browser — order matters: Edge and Opera both claim to be Chrome; Chrome claims Safari.
  const browsers = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/], ['Opera', /(?:OPR|Opera)\/([\d.]+)/], ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Brave', /Brave\/([\d.]+)/], ['Vivaldi', /Vivaldi\/([\d.]+)/], ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of browsers) { const v = m(re); if (v) { r.Browser = `${name} ${v}`; break; } }
  if (!r.Browser && /Safari/.test(ua) && /AppleWebKit/.test(ua)) r.Browser = 'Safari (in-app web view)';
  r.Engine = /iPhone|iPad|iPod/.test(ua) ? 'WebKit' : /Firefox\//.test(ua) ? 'Gecko' : /Chrome\/|Edg\//.test(ua) ? 'Blink' : /AppleWebKit/.test(ua) ? 'WebKit' : undefined;
  if (/iPhone|iPad|iPod/.test(ua)) {
    r.OS = `${/iPad/.test(ua) ? 'iPadOS' : 'iOS'} ${(m(/OS ([\d_]+)/) || '').replace(/_/g, '.')}`;
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) r.Engine = 'WebKit (every iOS browser uses it)';
  } else if (/Android/.test(ua)) r.OS = `Android ${m(/Android ([\d.]+)/) || ''}`;
  else if (/Windows NT/.test(ua)) r.OS = `Windows ${WIN[m(/Windows NT ([\d.]+)/)] || m(/Windows NT ([\d.]+)/)}`;
  else if (/CrOS/.test(ua)) r.OS = 'ChromeOS';
  else if (/Mac OS X/.test(ua)) r.OS = `macOS ${(m(/Mac OS X ([\d_.]+)/) || '').replace(/_/g, '.')}`;
  else if (/Linux/.test(ua)) r.OS = 'Linux';
  const dev = m(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
  r.Device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|iPod/.test(ua) ? 'Phone' : r.Bot ? 'Bot / script' : 'Desktop';
  if (dev && dev !== 'K') r.Model = dev.trim();
  if (/iPhone/.test(ua)) r.Model = 'iPhone';
  return r;
}

const userAgent = {
  id: 'useragent', name: 'User-agent parser', group: 'dev', icon: 'monitor-smartphone',
  desc: 'Read the browser, OS and device out of a User-Agent string.',
  keywords: 'user agent ua browser os device parse detect header',
  render(root) {
    const src = textarea({ rows: 4, value: navigator.userAgent });
    const table = h('dl', { class: 'kv wide' });
    const mine = h('button', { class: 'chip', type: 'button', onclick: () => { src.value = navigator.userAgent; run(); } }, 'This browser');
    const samples = [
      ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'],
      ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'],
      ['Windows Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0'],
      ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ];
    function run() {
      const r = parseUA(src.value);
      table.replaceChildren(...Object.entries(r).filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    }
    root.append(card(field('User-Agent', src), h('div', { class: 'chips' }, mine, samples.map(([l, ua]) => h('button', { class: 'chip', type: 'button', onclick: () => { src.value = ua; run(); } }, l)))),
      card(table),
      h('p', { class: 'field-hint' }, 'Browsers now hide details on purpose: Safari always reports macOS 10.15.7, and Windows 11 says “Windows NT 10.0”. Treat the result as a hint, not proof.'));
    on(src, run);
  },
};

// --- SQL formatter (library loaded only when this tool opens) ------------------------
const sql = {
  id: 'sql', name: 'SQL formatter', group: 'dev', icon: 'database',
  desc: 'Tidy up a SQL query: indentation, line breaks and keyword case.',
  keywords: 'sql format prettify beautify query postgres mysql sqlite supabase',
  render(root) {
    const src = textarea({ rows: 10, value: "select b.id, b.guest_name, sum(p.amount) as paid from bookings b left join payments p on p.booking_id = b.id where b.check_in >= '2026-10-01' and b.status in ('confirmed','paid') group by b.id, b.guest_name order by paid desc limit 20;" });
    const dialect = select([['postgresql', 'PostgreSQL (Supabase)'], ['mysql', 'MySQL'], ['sqlite', 'SQLite'], ['transactsql', 'SQL Server'], ['bigquery', 'BigQuery'], ['sql', 'Standard SQL']], 'postgresql');
    const kw = select([['upper', 'UPPER keywords'], ['lower', 'lower keywords'], ['preserve', 'Keep as typed']], 'upper');
    const ind = select([['2', '2 spaces'], ['4', '4 spaces']], '2');
    const out = output('Formatted', { multiline: true, rows: 16 });
    const err = note();
    let format = null;
    err.info('Loading the formatter…');
    function run() {
      if (!format) return;
      if (!src.value.trim()) { out.set(''); err.clear(); return; }
      try {
        out.set(format(src.value, { language: dialect.value, keywordCase: kw.value, tabWidth: +ind.value }));
        err.clear();
      } catch (e) { out.set(''); err.error(String(e.message).split('\n')[0]); }
    }
    import('../../vendor/sql-formatter.js').then(m => { format = m.format; run(); })
      .catch(() => err.error('Could not load the formatter — are you offline on a first visit?'));
    root.append(card(row(field('Dialect', dialect), field('Keywords', kw), field('Indent', ind))),
      h('div', { class: 'grid2' }, card(field('SQL', src), err.el), card(out.el)));
    on(src, run, 'input', 200);
    on([dialect, kw, ind], run, 'change');
  },
};

// --- HTTP status codes ----------------------------------------------------------------
const CODES = [
  [100, 'Continue', 'Keep sending the request body.'], [101, 'Switching Protocols', 'Upgrading, e.g. to WebSocket.'],
  [200, 'OK', 'It worked.'], [201, 'Created', 'A new resource was made (usually after POST).'],
  [202, 'Accepted', 'Queued — it will be processed later.'], [204, 'No Content', 'It worked, nothing to send back.'],
  [206, 'Partial Content', 'Part of a file (video seeking, resumable downloads).'],
  [301, 'Moved Permanently', 'The URL changed for good — browsers and Google update their links.'],
  [302, 'Found', 'Temporary redirect.'], [303, 'See Other', 'Go GET this other URL (after a form POST).'],
  [304, 'Not Modified', 'Use your cached copy.'], [307, 'Temporary Redirect', 'Like 302, but keep the method and body.'],
  [308, 'Permanent Redirect', 'Like 301, but keep the method and body.'],
  [400, 'Bad Request', 'The request is malformed — check the JSON or parameters.'],
  [401, 'Unauthorized', 'Not signed in, or the token is missing / expired.'],
  [402, 'Payment Required', 'Reserved; some APIs use it for billing limits.'],
  [403, 'Forbidden', 'Signed in, but not allowed (e.g. a row-level security policy).'],
  [404, 'Not Found', 'Nothing at this URL.'], [405, 'Method Not Allowed', 'Wrong method — e.g. GET where only POST works.'],
  [406, 'Not Acceptable', 'The server cannot reply in the format asked for.'],
  [408, 'Request Timeout', 'The client was too slow sending the request.'],
  [409, 'Conflict', 'Clashes with the current state — duplicate key, edit conflict.'],
  [410, 'Gone', 'It existed but was removed for good.'], [411, 'Length Required', 'Send a Content-Length header.'],
  [412, 'Precondition Failed', 'An If-Match / If-Unmodified-Since check failed.'],
  [413, 'Content Too Large', 'Upload is bigger than the server accepts.'], [414, 'URI Too Long', 'The URL is too long.'],
  [415, 'Unsupported Media Type', 'Wrong Content-Type — e.g. form data where JSON was expected.'],
  [418, "I'm a teapot", 'An April Fools joke that stuck.'],
  [422, 'Unprocessable Content', 'Well-formed but invalid — validation failed.'],
  [425, 'Too Early', 'Replay risk; retry later.'], [426, 'Upgrade Required', 'Switch protocol (e.g. to TLS).'],
  [428, 'Precondition Required', 'Send If-Match to avoid lost updates.'],
  [429, 'Too Many Requests', 'Rate limited — slow down and retry after the Retry-After time.'],
  [431, 'Request Header Fields Too Large', 'Headers (often cookies) are too big.'],
  [451, 'Unavailable For Legal Reasons', 'Blocked for legal reasons.'],
  [500, 'Internal Server Error', 'The server crashed — check its logs.'],
  [501, 'Not Implemented', 'The server does not support this.'],
  [502, 'Bad Gateway', 'A proxy got a bad answer from the app behind it (app down or crashing).'],
  [503, 'Service Unavailable', 'Overloaded or in maintenance — try again later.'],
  [504, 'Gateway Timeout', 'A proxy waited too long for the app behind it.'],
  [505, 'HTTP Version Not Supported', 'Old or unknown HTTP version.'],
  [507, 'Insufficient Storage', 'The server is out of space.'], [508, 'Loop Detected', 'Infinite loop while processing.'],
  [511, 'Network Authentication Required', 'Sign in to the WiFi (captive portal) first.'],
  [520, 'Web Server Returned an Unknown Error', 'Cloudflare: the origin sent something unexpected.'],
  [521, 'Web Server Is Down', 'Cloudflare: the origin refused the connection.'],
  [522, 'Connection Timed Out', 'Cloudflare: could not reach the origin in time.'],
  [524, 'A Timeout Occurred', 'Cloudflare: the origin took over 100 s to answer.'],
];
const CLASSES = { 1: 'Info', 2: 'Success', 3: 'Redirect', 4: 'Client error', 5: 'Server error' };

const httpCodes = {
  id: 'http', name: 'HTTP status codes', group: 'dev', icon: 'server',
  desc: 'What 401, 403, 422, 502 and the rest mean, in plain words.',
  keywords: 'http status code error 404 500 401 403 response meaning',
  render(root) {
    const q = input({ placeholder: 'Search: 429, timeout, redirect…' });
    const cls = tabs([['all', 'All'], ...Object.entries(CLASSES).map(([k, v]) => [k, `${k}xx`])], 'all', () => run());
    const list = h('div', { class: 'codes' });
    function run() {
      const s = q.value.trim().toLowerCase();
      const hits = CODES.filter(([c, n, d]) => (cls.value === 'all' || String(c)[0] === cls.value) && (!s || `${c} ${n} ${d}`.toLowerCase().includes(s)));
      list.replaceChildren(...hits.map(([c, n, d]) => h('div', { class: 'code-row', 'data-class': String(c)[0] },
        h('strong', { class: 'code-num' }, c), h('div', {}, h('div', { class: 'code-name' }, n), h('div', { class: 'field-hint' }, d)))));
      if (!hits.length) list.append(h('p', { class: 'field-hint' }, 'No code matches.'));
    }
    root.append(card(field('Search', q), cls), card(list));
    on(q, run);
  },
};

export default [subnetTool, docker, userAgent, sql, httpCodes];
export { subnet, shellWords, dockerToCompose, parseUA };
