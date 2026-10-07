// Smoke test: opens every tool in headless Chrome, checks it renders without
// errors, runs a few known-answer checks, and saves screenshots.
//   node tests/smoke.mjs [http://127.0.0.1:8471/] [--shots]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8471/';
const SHOTS = process.argv.includes('--shots');
const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(here, '..', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'toolbox-chrome-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, nextId = 1;
const pending = new Map();
const errors = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise(r => ws.addEventListener('open', r, { once: true }));
        ws.addEventListener('message', ev => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
          if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
          if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
        });
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}
const send = (method, params = {}) => new Promise(r => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
  return r.result?.result?.value;
}
async function shot(name) {
  if (!SHOTS) return;
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(shotDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 3 : 2, mobile });
}

// Known-answer checks, run inside the page after the tool has rendered.
// Each returns a string describing the failure, or '' when it passes.
// Sets a field and waits long enough for debounced tools to update.
const set = (sel, v, i = 0) => `(async () => { const el = document.querySelectorAll('${sel}')[${i}]; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 250)); })()`;
const val = (sel, i = 0) => `document.querySelectorAll('${sel}')[${i}].value`;
const CHECKS = {
  token: [`(${val('.output textarea')}.length === 32 ? '' : 'token length ' + ${val('.output textarea')}.length)`],
  hash: [set('textarea', 'hello'), 'new Promise(r => setTimeout(r, 300))',
    `(${val('.output input', 0)} === '5d41402abc4b2a76b9719d911017c592' && ${val('.output input', 2)} === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' ? '' : 'hash wrong: ' + ${val('.output input', 0)})`],
  bcrypt: [set('input.input', 'secret', 3), set('input.input', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 4), 'new Promise(r => setTimeout(r, 1500))',
    `(document.querySelector('.verdict').textContent.includes('No match') ? '' : 'bcrypt verdict: ' + document.querySelector('.verdict').textContent)`,
    set('input.input', 'secret', 0), `document.querySelector('.btn.primary').click()`, 'new Promise(r => setTimeout(r, 1500))',
    `(() => { const i = document.querySelectorAll('input.input'); i[4].value = i[2].value; i[4].dispatchEvent(new Event('input')); })()`, 'new Promise(r => setTimeout(r, 1500))',
    `(document.querySelector('.verdict').textContent.includes('✓ Match') ? '' : 'bcrypt round trip: ' + document.querySelector('.verdict').textContent)`],
  uuid: [`(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(${val('.output textarea')}) ? '' : 'uuid v4 bad')`,
    `(document.querySelectorAll('.tabs button')[1].click(), /^[0-9a-f]{8}-[0-9a-f]{4}-7/.test(${val('.output textarea')}) ? '' : 'uuid v7 bad')`,
    `(document.querySelectorAll('.tabs button')[2].click(), /^[0-9A-HJKMNP-TV-Z]{26}$/.test(${val('.output textarea')}) ? '' : 'ulid bad ' + ${val('.output textarea')})`],
  jwt: [set('textarea', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.x'),
    `(${val('.output textarea', 1)}.includes('John Doe') && document.querySelector('.verdict').textContent.includes('Expired') ? '' : 'jwt decode failed')`],
  base64: [set('textarea', 'Héllo 👋', 0), `(${val('textarea', 1)} === 'SMOpbGxvIPCfkYs=' ? '' : 'b64 encode: ' + ${val('textarea', 1)})`,
    set('textarea', 'U2VsYW1hdCBwYWdp', 1), `(${val('textarea', 0)} === 'Selamat pagi' ? '' : 'b64 decode')`],
  formats: [`(${val('.output textarea')}.includes('weekday: 180') ? '' : 'json->yaml: ' + ${val('.output textarea')})`,
    `(document.querySelectorAll('select')[1].value = 'TOML', document.querySelectorAll('select')[1].dispatchEvent(new Event('change')), ${val('.output textarea')}.includes('[prices]') ? '' : 'json->toml')`,
    `(document.querySelectorAll('select')[1].value = 'CSV', document.querySelectorAll('select')[1].dispatchEvent(new Event('change')), ${val('.output textarea')}.includes('prices.weekday') ? '' : 'json->csv: ' + ${val('.output textarea')})`],
  datetime: [set('input.input', '1759800000'), `(${val('.output input', 2)} === '2025-10-07T01:20:00.000Z' ? '' : 'iso: ' + ${val('.output input', 2)})`],
  color: [set('input.input', 'rgb(232 163 61)'), `(${val('.output input', 0)} === '#e8a33d' && ${val('.output input', 2)} === 'hsl(36 79% 57%)' ? '' : 'colour: ' + ${val('.output input', 0)} + ' ' + ${val('.output input', 2)})`,
    set('input.input', 'teal'), `(${val('.output input', 0)} === '#008080' ? '' : 'named colour')`],
  bases: [`(${val('input.input', 0)} === '11111101010' && ${val('input.input', 3)} === '7ea' ? '' : 'bases: ' + ${val('input.input', 0)})`,
    set('input.input', 'ffffffffffffffffffff', 3), `(${val('input.input', 2)} === '1208925819614629174706175' ? '' : 'bigint: ' + ${val('input.input', 2)})`],
  url: [`(document.querySelectorAll('.table tr').length === 4 ? '' : 'query rows ' + document.querySelectorAll('.table tr').length)`,
    set('textarea', 'a b&c', 0), `(${val('textarea', 1)} === 'a%20b%26c' ? '' : 'url encode')`],
  regex: [`(document.querySelectorAll('pre.hl mark').length === 2 ? '' : 'regex marks ' + document.querySelectorAll('pre.hl mark').length)`],
  cron: [`(document.querySelector('.big-say').textContent.includes('09:30') && document.querySelectorAll('.runs li').length === 6 ? '' : 'cron: ' + document.querySelector('.big-say').textContent)`,
    set('input.input', '0 0 31 2 *'), `(document.querySelector('.runs').textContent.includes('Never') ? '' : 'cron never')`],
  chmod: [`(${val('.output input', 0)} === 'rwxr-xr-x' ? '' : 'chmod sym')`, set('input.input', '640', 0), `(${val('.output input', 0)} === 'rw-r-----' ? '' : 'chmod 640')`],
  diff: [`(document.querySelectorAll('pre.diffview ins').length > 0 && document.querySelectorAll('pre.diffview del').length > 0 ? '' : 'diff empty')`],
  json: [`(${val('.output textarea')}.startsWith('{\\n  "guest"') ? '' : 'json pretty')`, set('textarea', '{"a":1,}', 0), `(document.querySelector('.note.error') && !document.querySelector('.note.error').hidden ? '' : 'json error not shown')`],
  qr: [`(document.querySelector('canvas.qr').toDataURL().length > 2000 ? '' : 'qr blank')`],
  lorem: [`(${val('.output textarea')}.startsWith('Lorem ipsum dolor sit amet') ? '' : 'lorem')`],
  stats: [set('textarea', 'Satu dua tiga.\n\nEmpat lima.'), `(document.querySelector('.stat strong').textContent === '5' ? '' : 'words ' + document.querySelector('.stat strong').textContent)`],
  case: [`(${val('.output input', 0)} === 'kasih-alza-homestay-bilik-keluarga' && ${val('.output input', 1)} === 'kasihAlzaHomestayBilikKeluarga' ? '' : 'case: ' + ${val('.output input', 0)})`],
  placeholder: [`(document.querySelector('.preview svg') ? '' : 'no svg preview')`],
  strength: [set('input.input', 'Password1'), `(document.querySelector('.verdict').textContent.includes('Weak') ? '' : 'Password1 not weak: ' + document.querySelector('.verdict').textContent)`,
    set('input.input', 'tukang-kayu-lompat-pagar-77'), `(document.querySelector('.kv dd').textContent.match(/about (\\d+)/)[1] < 75 ? '' : 'passphrase over-scored: ' + document.querySelector('.kv dd').textContent)`,
    set('input.input', 'tukang-kayu-lompat-pagar-tinggi-77'), `(document.querySelector('.verdict').textContent.includes('Strong') ? '' : '5-word passphrase not strong: ' + document.querySelector('.verdict').textContent)`,
    set('input.input', 'Xq7#vLp2$Rm9!kTz'), `(document.querySelector('.verdict').textContent.includes('Strong') ? '' : 'random 16 not strong')`],
  checksum: [giveFile('input[type=file]', `new File(['hello'], 'hello.txt', { type: 'text/plain' })`), 'new Promise(r => setTimeout(r, 400))',
    `(${val('.output input', 0)} === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' && ${val('.output input', 3)} === '5d41402abc4b2a76b9719d911017c592' ? '' : 'file sha256: ' + ${val('.output input', 0)})`,
    set('input.input', 'sha256: 2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824', 0), `(document.querySelector('.verdict').textContent.includes('Matches the SHA-256') ? '' : 'checksum compare: ' + document.querySelector('.verdict').textContent)`],
  entities: [`(${val('textarea', 1)}.includes('&lt;b&gt;RM180&lt;/b&gt; &amp; &quot;sarapan&quot;') ? '' : 'encode: ' + ${val('textarea', 1)})`,
    set('textarea', '&lt;p&gt; &copy; &#x1F44B;', 1), `(${val('textarea', 0)} === '<p> © 👋' ? '' : 'decode: ' + ${val('textarea', 0)})`],
  markdown: ['new Promise(r => setTimeout(r, 300))', `(${val('.output textarea')}.includes('<table>') && ${val('.output textarea')}.includes('<strong>3-bedroom</strong>') ? '' : 'markdown html')`,
    `(document.querySelector('iframe.md-frame').getAttribute('sandbox') === '' ? '' : 'preview iframe is not sandboxed')`],
  subnet: [`(document.querySelector('.kv').textContent.includes('192.168.1.255') && document.querySelector('.kv').textContent.includes('Usable hosts254') ? '' : 'subnet /24: ' + document.querySelector('.kv').textContent.slice(0, 120))`,
    set('input.input', '10.20.30.40 255.255.255.252'), `(document.querySelector('.kv').textContent.includes('10.20.30.40/30') && document.querySelector('.kv').textContent.includes('Usable hosts2') ? '' : 'subnet mask form')`],
  docker: ['new Promise(r => setTimeout(r, 300))', `(() => { const y = ${val('.output textarea')}; return y.includes('container_name: n8n') && y.includes('- "5678:5678"') && y.includes('n8n_data: {}') && y.includes('restart: unless-stopped') ? '' : 'compose: ' + y; })()`,
    `(document.querySelector('.tips').textContent.includes('-d') ? '' : 'no note about -d')`,
    set('textarea', 'docker run -it --rm --network host -e "A=b c" --gpus all ubuntu bash -c "echo hi"'), `(() => { const y = ${val('.output textarea')}; return y.includes('network_mode: host') && y.includes('A=b c') && y.includes('tty: true') && y.includes('- bash') && y.includes('capabilities') ? '' : 'compose 2: ' + y; })()`],
  useragent: [`document.querySelectorAll('.chip')[1].click()`, `(document.querySelector('.kv').textContent.includes('iOS 18.5') && document.querySelector('.kv').textContent.includes('Safari 18.5') ? '' : 'ua iphone: ' + document.querySelector('.kv').textContent)`,
    `document.querySelectorAll('.chip')[3].click()`, `(document.querySelector('.kv').textContent.includes('Edge 139') && document.querySelector('.kv').textContent.includes('Windows 10 or 11') ? '' : 'ua edge: ' + document.querySelector('.kv').textContent)`,
    `document.querySelectorAll('.chip')[4].click()`, `(document.querySelector('.kv').textContent.includes('Googlebot') ? '' : 'ua bot: ' + document.querySelector('.kv').textContent)`],
  sql: ['new Promise(r => setTimeout(r, 1500))', `(${val('.output textarea')}.startsWith('SELECT\\n  b.id,') && ${val('.output textarea')}.includes('LEFT JOIN payments') ? '' : 'sql: ' + ${val('.output textarea')}.slice(0, 80))`],
  http: [set('input.input', '429'), `(document.querySelectorAll('.code-row').length === 1 && document.querySelector('.code-name').textContent === 'Too Many Requests' ? '' : 'http search')`],
  qrscan: [`document.querySelectorAll('.tabs button')[1].click()`,
    `(async () => { const q = (await import(new URL('vendor/qrcode.js', location.href))).default; const m = q(0, 'M'); m.addData('WIFI:T:WPA;S:Rumah Kita;P:abc\\\\;123;;'); m.make(); const n = m.getModuleCount(), c = document.createElement('canvas'); c.width = c.height = (n + 8) * 8; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m.isDark(r, k)) x.fillRect((k + 4) * 8, (r + 4) * 8, 8, 8); const blob = await new Promise(r => c.toBlob(r)); const dt = new DataTransfer(); dt.items.add(new File([blob], 'qr.png', { type: 'image/png' })); const inp = document.querySelector('input[type=file]'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 1500)); })()`,
    `(document.querySelector('.scan-result').textContent.includes('Rumah Kita') && document.querySelector('.scan-result').textContent.includes('abc;123') ? '' : 'qr scan: ' + document.querySelector('.scan-result').textContent)`],
};

// Puts a File into a file input, as if the user had picked it.
function giveFile(sel, fileExpr) {
  return `(() => { const dt = new DataTransfer(); dt.items.add(${fileExpr}); const inp = document.querySelector('${sel}'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); })()`;
}

let failedHome = false;
try {
  mkdirSync(shotDir, { recursive: true });
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await viewport(1400, 900);
  await send('Page.navigate', { url: BASE });
  await sleep(1200);
  const tools = await evaluate(`[...document.querySelectorAll('.board .tool-card')].map(a => a.getAttribute('href').split('/').pop())`);
  console.log(`home: ${tools.length} tools`);
  if (!tools.length) { console.log(errors.join("\n")); failedHome = true; }
  await shot('home-desktop');
  if (BASE.startsWith('https:')) {
    const sw = await evaluate(`navigator.serviceWorker.ready.then(r => !!r.active)`);
    console.log(`${sw ? '✓' : '✗'} offline service worker active`);
    if (!sw) failedHome = true;
    // Cut the network, reload, and use a tool whose library loads on demand.
    await sleep(1500); // let the install finish caching
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send('Page.reload'); await sleep(1500);
    const offTools = await evaluate(`document.querySelectorAll('.board .tool-card').length`);
    await evaluate(`location.hash = '#/tool/sql'`); await sleep(1500);
    const offSql = await evaluate(`document.querySelector('.output textarea').value.startsWith('SELECT')`);
    const offOk = offTools === tools.length && offSql;
    console.log(`${offOk ? '✓' : '✗'} works offline (${offTools} tools, SQL formatter ${offSql ? 'loads' : 'fails'})`);
    if (!offOk) failedHome = true;
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(`location.hash = '#/'`); await sleep(300);
  }
  let failed = 0;
  for (const id of tools) {
    errors.length = 0;
    await evaluate(`location.hash = '#/tool/${id}'`);
    await sleep(350);
    const problems = [];
    for (const c of CHECKS[id] || []) {
      try { const r = await evaluate(c); if (typeof r === 'string' && r) problems.push(r); }
      catch (e) { problems.push(String(e.message).split('\n')[0]); }
    }
    await sleep(100);
    if (errors.length) problems.push(...errors.map(e => 'console: ' + e.split('\n')[0]));
    if (!CHECKS[id]) problems.push('no checks written');
    console.log(`${problems.length ? '✗' : '✓'} ${id}${problems.length ? '  ' + problems.join(' | ') : ''}`);
    if (problems.length) failed++;
    await shot('tool-' + id);
  }
  // Shell behaviour: kept inputs, secrets not kept, Paste buttons.
  const shell = [];
  await evaluate(`location.hash = '#/tool/case'`); await sleep(300);
  await evaluate(set('input.input', 'Kept Between Visits'));
  await evaluate(`location.hash = '#/'`); await sleep(200);
  await evaluate(`location.hash = '#/tool/case'`); await sleep(300);
  if (await evaluate(val('input.input')) !== 'Kept Between Visits') shell.push('input not kept');
  if (await evaluate(val('.output input', 0)) !== 'kept-between-visits') shell.push('kept input not re-applied to outputs');
  await evaluate(`[...document.querySelectorAll('.linkish')].find(b => b.textContent === 'Reset').click()`); await sleep(300);
  if (await evaluate(val('input.input')) === 'Kept Between Visits') shell.push('Reset did not clear');
  await evaluate(`location.hash = '#/tool/jwt'`); await sleep(300);
  await evaluate(set('textarea', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.x'));
  await evaluate(`location.hash = '#/'`); await sleep(200);
  await evaluate(`location.hash = '#/tool/jwt'`); await sleep(300);
  if (await evaluate(val('textarea')) !== '') shell.push('JWT was kept (secrets must not be)');
  if (!await evaluate(`!!document.querySelector('.field-head .btn.ghost')`)) shell.push('no Paste button');
  console.log(shell.length ? `✗ shell  ${shell.join(' | ')}` : '✓ shell (kept inputs, secrets not kept, Paste)');
  if (shell.length) failed++;

  // Phone views and the light theme.
  await viewport(393, 852, true);
  await evaluate(`location.hash = '#/'`); await sleep(400); await shot('home-phone');
  await evaluate(`location.hash = '#/tool/qr'`); await sleep(400); await shot('qr-phone');
  await evaluate(`location.hash = '#/tool/jwt'`); await sleep(400); await shot('jwt-phone');
  await evaluate(`location.hash = '#/tool/docker'`); await sleep(400); await shot('docker-phone');
  await evaluate(`location.hash = '#/tool/qrscan'`); await sleep(400); await shot('qrscan-phone');
  const overflow = await evaluate(`document.documentElement.scrollWidth > innerWidth`);
  if (overflow) { console.log('✗ phone page scrolls sideways'); failed++; }
  await viewport(1400, 900);
  await evaluate(`document.getElementById('theme').click(); location.hash = '#/'`); await sleep(400); await shot('home-light');
  await evaluate(`location.hash = '#/tool/color'`); await sleep(400); await shot('color-light');
  if (failedHome) failed++;
  console.log(failed ? `\n${failed} tool(s) failed` : '\nAll tools passed');
  process.exitCode = failed ? 1 : 0;
} finally {
  chrome.kill();
}
