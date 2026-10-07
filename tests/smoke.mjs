// Smoke test: opens every tool in headless Chrome, checks it renders without
// errors, runs a few known-answer checks, and saves screenshots.
//   node tests/smoke.mjs [http://127.0.0.1:8471/] [--shots] [--only=id,id] [--port=9333]
// --only runs just those tools (and skips the shell and phone checks).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { set, val, giveFile, pngFile } from './helpers.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8471/';
const SHOTS = process.argv.includes('--shots');
const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(here, '..', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = +(process.argv.find(a => a.startsWith('--port='))?.slice(7) || 9333);
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'toolbox-chrome-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmpDir = mkdtempSync(join(tmpdir(), 'toolbox-fixtures-'));

// A valid one-page PDF, written by hand so the test needs no library.
function minimalPdf() {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'];
  let out = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

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

// Known-answer checks live in tests/checks/*.mjs, one file per drawer.
const CHECKS = {};
for (const f of readdirSync(join(here, 'checks')).filter(f => f.endsWith('.mjs')).sort()) {
  Object.assign(CHECKS, (await import(join(here, 'checks', f))).default);
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
  for (const id of ONLY ? tools.filter(t => ONLY.includes(t)) : tools) {
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
  if (ONLY) {
    const missing = ONLY.filter(t => !tools.includes(t));
    if (missing.length) { console.log(`✗ not on the home page: ${missing.join(', ')}`); failed++; }
    console.log(failed ? `\n${failed} tool(s) failed` : '\nAll tools passed');
    process.exitCode = failed ? 1 : 0;
    chrome.kill(); process.exit();
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

  // Hand-offs: QR code → Send to… → QR scanner reads it back.
  const hand = [];
  errors.length = 0;
  await evaluate(`location.hash = '#/tool/qr'`); await sleep(300);
  await evaluate(set('textarea', 'https://thetoolbox.pages.dev/#handoff'));
  await evaluate(`[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Send to')).click()`);
  await evaluate(`(async () => { const t = Date.now(); while (!document.querySelector('.sheet') && Date.now() - t < 5000) await new Promise(r => setTimeout(r, 100)); })()`);
  if (!await evaluate(`!!document.querySelector('.sheet [data-group] strong')`)) hand.push('Send to sheet did not open: ' + await evaluate(`location.hash + ' sendbtns=' + [...document.querySelectorAll('.btn')].filter(b => b.textContent.includes('Send to')).length + ' wraps=' + document.querySelectorAll('.sheet-wrap').length + ' sheet=' + (document.querySelector('.sheet')?.textContent.slice(0, 120) || '')`));
  await evaluate(`[...document.querySelectorAll('.sheet-item')].find(b => b.textContent.includes('QR scanner'))?.click()`); await sleep(1800);
  const read = await evaluate(`document.querySelector('.scan-result')?.textContent || ''`);
  if (!read.includes('thetoolbox.pages.dev/#handoff')) hand.push('QR scanner did not read the sent QR: ' + read.slice(0, 60));
  // A file pasted on the home page offers the tools that open it.
  await evaluate(`location.hash = '#/'`); await sleep(300);
  await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['{"a":1}'], 'data.json', { type: 'application/json' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); })()`); await sleep(300);
  const offered = await evaluate(`[...document.querySelectorAll('.sheet-item strong')].map(s => s.textContent)`);
  if (!offered.includes('JSON formatter')) hand.push('pasted .json did not offer JSON formatter: ' + offered.join(', '));
  await evaluate(`[...document.querySelectorAll('.sheet-item')].find(b => b.textContent.includes('JSON formatter'))?.click()`); await sleep(400);
  if (!(await evaluate(`document.querySelector('.output textarea')?.value || ''`)).includes('"a": 1')) hand.push('JSON formatter did not open the pasted file');
  // Workflows page lists the ready-made ones and opens one.
  await evaluate(`location.hash = '#/workflows'`); await sleep(400);
  const wfs = await evaluate(`document.querySelectorAll('.wf-card').length`);
  if (wfs < 10) hand.push('workflow cards: ' + wfs);
  await shot('workflows');
  await evaluate(`location.hash = '#/workflows/photo-web'`); await sleep(400);
  if (await evaluate(`document.querySelectorAll('.wf-step').length`) !== 3) hand.push('photo-web does not show 3 steps');
  await evaluate(giveFile('.drop input[type=file]', pngFile(3000, 2000, '#e8a33d', 'holiday.png')));
  await evaluate(`[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Run')).click()`);
  await evaluate(`(async () => { const t = Date.now(); while (!document.querySelector('.wf-results li') && Date.now() - t < 15000) await new Promise(r => setTimeout(r, 200)); })()`);
  const wfOut = await evaluate(`document.querySelector('.wf-results')?.textContent || document.querySelector('.progress-label')?.textContent || ''`);
  if (!wfOut.includes('holiday.webp') && !wfOut.includes('holiday.jpg')) hand.push('photo-web run: ' + wfOut.slice(0, 120));
  await evaluate(`location.hash = '#/workflows'`); await sleep(300);
  if (await evaluate(`[...document.querySelectorAll('main h2, main p, main span')].some(e => e.textContent.trim() === '0')`)) hand.push('stray 0 on the workflows page');
  await evaluate(`location.hash = '#/workflows/photo-web'`); await sleep(400);
  await shot('workflow-photo-web');
  if (errors.length) hand.push(...errors.map(e => 'console: ' + e.split('\n')[0]));

  // Real drag-and-drop of a file from disk onto every tool's drop zone: the
  // "Drop to open" overlay must go away, no "Open with…" sheet may appear, and
  // the page must change (the tool took the file).
  const fixtures = {
    png: join(here, '..', 'icons', 'apple-touch-icon.png'),
    pdf: join(tmpDir, 'drop.pdf'),
    txt: join(tmpDir, 'drop.srt'),
  };
  writeFileSync(fixtures.pdf, minimalPdf());
  writeFileSync(fixtures.txt, '1\n00:00:01,000 --> 00:00:02,000\nHello\n');
  const dropFails = [];
  let zones = 0;
  for (const id of tools) {
    await evaluate(`location.hash = '#/tool/${id}'`); await sleep(250);
    const n = await evaluate(`document.querySelectorAll('.drop').length`);
    for (let i = 0; i < n; i++) {
      const z = await evaluate(`(() => { const d = document.querySelectorAll('.drop')[${i}]; if (!d || d.closest('[hidden]')) return null; d.scrollIntoView({ block: 'center' }); const r = d.getBoundingClientRect(); const a = (d.querySelector('input[type=file]')?.accept || ''); return { x: r.x + r.width / 2, y: r.y + r.height / 2, accept: a }; })()`);
      if (!z) continue;
      zones++;
      const file = /pdf/.test(z.accept) ? fixtures.pdf : /srt|vtt/.test(z.accept) && !/video/.test(z.accept) ? fixtures.txt : fixtures.png;
      const before = await evaluate(`document.querySelector('main').innerHTML.length`);
      const data = { items: [], files: [file], dragOperationsMask: 1 };
      await send('Input.dispatchDragEvent', { type: 'dragEnter', x: z.x, y: z.y, data });
      await send('Input.dispatchDragEvent', { type: 'dragOver', x: z.x, y: z.y, data });
      const during = await evaluate(`document.body.classList.contains('dragging')`);
      await send('Input.dispatchDragEvent', { type: 'drop', x: z.x, y: z.y, data });
      await sleep(600);
      const st = await evaluate(`({ overlay: document.body.classList.contains('dragging'), sheet: !!document.querySelector('.sheet-wrap'), size: document.querySelector('main').innerHTML.length })`);
      const p = [];
      if (!during) p.push('overlay never showed');
      if (st.overlay) p.push('overlay stuck');
      if (st.sheet) p.push('Open-with sheet appeared');
      if (st.size === before) p.push('nothing happened');
      if (p.length) dropFails.push(`${id}#${i}: ${p.join(', ')}`);
      await evaluate(`document.querySelector('.sheet-wrap')?.remove()`);
      await evaluate(`location.hash = '#/'`); await sleep(100);
      await evaluate(`location.hash = '#/tool/${id}'`); await sleep(250);
    }
  }
  console.log(dropFails.length ? `✗ drag and drop  ${dropFails.join(' | ')}` : `✓ drag and drop (${zones} drop zones: overlay clears, tool takes the file)`);
  if (dropFails.length) failed++;
  console.log(hand.length ? `✗ hand-offs  ${hand.join(' | ')}` : '✓ hand-offs (Send to, paste a file, workflows)');
  if (hand.length) failed++;

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
