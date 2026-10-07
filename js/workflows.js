// Workflows: several tools run one after another over the files you drop.
// Tools offer steps (tool.steps) — the same work as the tool, without the UI:
//   { id, name, accepts: ['image/*'], options: [{ key, label, type, value, … }],
//     run(files, opts, ctx) → Promise<File[]> }   ctx.progress(0..1, label)
// Option types: number (min/max/step), range (min/max/step), select (choices:
// [[value, label]]), text, checkbox, colour.
// A workflow is { id, name, desc, steps: [{ step: 'img-resize', opts: { max: 1600 } }] }.
import { h, card, field, input, select, checkbox, dropzone, download, fmtBytes, progress, toast } from './ui.js';
import { icon } from './icons.js';
import { hub, sendBtn } from './hub.js';

export const PRESETS = [
  { id: 'photo-web', name: 'Photo for the web', desc: 'Remove location and camera data, shrink to 1920 px, save as WebP.',
    steps: [{ step: 'img-strip' }, { step: 'img-resize', opts: { max: 1920 } }, { step: 'img-convert', opts: { format: 'image/webp', quality: 0.82 } }] },
  { id: 'share-safe', name: 'Safe to share', desc: 'Strip GPS location and camera details from photos before posting.',
    steps: [{ step: 'img-strip' }] },
  { id: 'insta-square', name: 'Instagram square', desc: 'Put each picture on a white square, save as JPEG.',
    steps: [{ step: 'img-matte', opts: { ratio: '1:1', colour: '#ffffff' } }, { step: 'img-convert', opts: { format: 'image/jpeg', quality: 0.9 } }] },
  { id: 'watermark-batch', name: 'Watermark a batch', desc: 'Stamp your name on every picture, save as JPEG.',
    steps: [{ step: 'img-watermark', opts: { text: '© Luqman Hakeem' } }, { step: 'img-convert', opts: { format: 'image/jpeg', quality: 0.9 } }] },
  { id: 'product-cutout', name: 'Product cut-out', desc: 'Remove the background, trim, centre on a white square.',
    steps: [{ step: 'img-bg-remove' }, { step: 'img-trim' }, { step: 'img-matte', opts: { ratio: '1:1', colour: '#ffffff' } }] },
  { id: 'favicon-pack', name: 'Favicon pack from a logo', desc: 'Trim the logo and make every favicon size plus favicon.ico.',
    steps: [{ step: 'img-trim' }, { step: 'img-favicon' }] },
  { id: 'photos-pdf', name: 'Photos to one PDF', desc: 'Shrink photos, put them in one PDF and number the pages.',
    steps: [{ step: 'img-resize', opts: { max: 2000 } }, { step: 'images-to-pdf' }, { step: 'pdf-number' }] },
  { id: 'pdf-send', name: 'PDF ready to send', desc: 'Merge PDFs into one, number the pages, make it smaller.',
    steps: [{ step: 'pdf-merge' }, { step: 'pdf-number' }, { step: 'pdf-compress' }] },
  { id: 'clip-gif', name: 'Video clip to GIF', desc: 'Turn a short video into a looping GIF for chat.',
    steps: [{ step: 'video-gif', opts: { fps: 12, width: 480 } }] },
  { id: 'voice-clean', name: 'Even out a recording', desc: 'Bring a voice note or podcast to a steady loudness.',
    steps: [{ step: 'audio-normalise' }] },
];

const store = {
  get() { try { return JSON.parse(localStorage.getItem('toolbox.workflows')) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem('toolbox.workflows', JSON.stringify(v)); } catch { toast('Could not save — storage is blocked'); } },
};

const allSteps = () => Object.fromEntries(hub.tools.flatMap(t => (t.steps || []).map(s => [s.id, { ...s, tool: t }])));

function fileMatches(f, p) {
  if (p === 'file') return true;
  if (p.startsWith('.')) return f.name.toLowerCase().endsWith(p);
  if (p.endsWith('/*')) return (f.type || '').startsWith(p.slice(0, -1));
  return f.type === p;
}

const defaults = s => Object.fromEntries((s.options || []).map(o => [o.key, o.value]));

// Runs a workflow over files. Files a step cannot take pass through untouched.
export async function runWorkflow(wf, files, onProgress = () => {}) {
  const steps = allSteps();
  let cur = files;
  for (const [i, ws] of wf.steps.entries()) {
    const s = steps[ws.step];
    if (!s) throw new Error(`Step “${ws.step}” is not available`);
    const mine = cur.filter(f => (s.accepts || ['file']).some(p => fileMatches(f, p)));
    const rest = cur.filter(f => !mine.includes(f));
    if (!mine.length) throw new Error(`${s.name}: none of the files are something it can take (${(s.accepts || []).join(', ')})`);
    const label = `Step ${i + 1} of ${wf.steps.length}: ${s.name}`;
    onProgress(i / wf.steps.length, label);
    const out = await s.run(mine, { ...defaults(s), ...(ws.opts || {}) },
      { progress: (v, l) => onProgress((i + Math.max(0, Math.min(1, v))) / wf.steps.length, l ? `${label} — ${l}` : label) });
    cur = [...out, ...rest];
  }
  onProgress(1, 'Done');
  return cur;
}

// --- views ---------------------------------------------------------------------
export function renderWorkflows(main) {
  const id = location.hash.match(/^#\/workflows\/([\w-]+)/)?.[1];
  if (!id) return renderList(main);
  if (id === 'new') return renderEditor(main, { id: 'wf-' + Date.now().toString(36), name: 'My workflow', desc: '', steps: [] }, true);
  const mine = store.get().find(w => w.id === id);
  const wf = mine || PRESETS.find(w => w.id === id);
  if (!wf) { location.hash = '#/workflows'; return; }
  return renderEditor(main, structuredClone(wf), !!mine);
}

function head(title, lede) {
  return h('div', { class: 'tool-head', 'data-group': 'workflow' },
    h('a', { class: 'back', href: location.hash.startsWith('#/workflows/') ? '#/workflows' : '#/' }, location.hash.startsWith('#/workflows/') ? '← All workflows' : '← All tools'),
    h('div', { class: 'title-row' },
      h('span', { class: 'tool-icon big' }, icon('workflow', 32)),
      h('div', {}, h('span', { class: 'eyebrow' }, 'Workflows'), h('h1', {}, title))),
    h('p', { class: 'lede' }, lede));
}

function wfCard(wf, steps) {
  const missing = wf.steps.filter(s => !steps[s.step]).length;
  return h('a', { class: 'tool-card wf-card', href: `#/workflows/${wf.id}`, 'data-group': 'workflow' },
    h('span', { class: 'hook', 'aria-hidden': 'true' }),
    h('span', { class: 'tool-icon' }, icon('workflow', 26)),
    h('span', { class: 'tool-text' },
      h('strong', {}, wf.name),
      h('span', {}, wf.desc || wf.steps.map(s => steps[s.step]?.name || s.step).join(' → ')),
      h('span', { class: 'wf-chain' }, wf.steps.map(s => steps[s.step]?.name || s.step).join(' → ') + (missing ? ' (needs tools not built yet)' : ''))));
}

function renderList(main) {
  const steps = allSteps();
  const mine = store.get();
  main.replaceChildren(
    head('Workflows', 'Run several tools in a row over a batch of files — drop the files once, get the finished results. Everything happens on this device.'),
    mine.length > 0 && h('section', { class: 'shelf', 'data-group': 'workflow' },
      h('header', {}, h('h2', {}, 'Mine'), h('p', {}, 'Saved on this device')),
      h('div', { class: 'board' }, mine.map(w => wfCard(w, steps)))),
    h('section', { class: 'shelf', 'data-group': 'workflow' },
      h('header', {}, h('h2', {}, 'Ready-made'), h('p', {}, 'Open one to run it, change its settings, or save your own copy')),
      h('div', { class: 'board' }, PRESETS.map(w => wfCard(w, steps)),
        h('a', { class: 'tool-card wf-card new', href: '#/workflows/new', 'data-group': 'workflow' },
          h('span', { class: 'hook', 'aria-hidden': 'true' }),
          h('span', { class: 'tool-icon' }, icon('plus', 26)),
          h('span', { class: 'tool-text' }, h('strong', {}, 'Build your own'), h('span', {}, 'Pick the steps and their settings'))))),
    h('section', { class: 'card' },
      h('h3', {}, 'Steps you can use'),
      h('p', { class: 'field-hint' }, 'Each step is one of the tools in the toolbox, run without its screen.'),
      h('ul', { class: 'tips' }, Object.values(steps).map(s => h('li', {}, h('strong', {}, s.name), ` — from ${s.tool.name}`)))));
  document.title = 'Workflows · The Toolbox';
}

function optionControl(o, value, onchange) {
  let el;
  if (o.type === 'select') { el = select(o.choices, String(value)); el.onchange = () => onchange(o.choices.find(c => String(c[0]) === el.value)?.[0] ?? el.value); }
  else if (o.type === 'checkbox') { const c = checkbox(o.label, !!value); c.input.onchange = () => onchange(c.input.checked); return c; }
  else if (o.type === 'colour') { el = h('input', { type: 'color', class: 'input colour-input', value }); el.oninput = () => onchange(el.value); }
  else if (o.type === 'number' || o.type === 'range') {
    el = input({ type: 'number', value, min: o.min, max: o.max, step: o.step || 'any' });
    el.oninput = () => { if (el.value !== '') onchange(+el.value); };
  } else { el = input({ value }); el.oninput = () => onchange(el.value); }
  return field(o.label, el, o.hint);
}

function renderEditor(main, wf, isMine) {
  const steps = allSteps();
  const list = h('ol', { class: 'wf-steps' });
  const name = input({ value: wf.name });
  name.oninput = () => { wf.name = name.value; };
  const addSel = select([['', 'Add a step…'], ...Object.values(steps).map(s => [s.id, `${s.name} (${s.tool.name})`])], '');
  addSel.onchange = () => {
    if (!addSel.value) return;
    wf.steps.push({ step: addSel.value, opts: {} });
    addSel.value = '';
    drawSteps();
  };

  function drawSteps() {
    list.replaceChildren(...wf.steps.map((ws, i) => {
      const s = steps[ws.step];
      ws.opts ||= {};
      const move = (d) => { const j = i + d; if (j < 0 || j >= wf.steps.length) return; [wf.steps[i], wf.steps[j]] = [wf.steps[j], wf.steps[i]]; drawSteps(); };
      return h('li', { class: 'wf-step' + (s ? '' : ' missing') },
        h('div', { class: 'wf-step-head' },
          h('span', { class: 'wf-num' }, i + 1),
          s && h('span', { class: 'tool-icon', 'data-group': s.tool.group }, icon(s.tool.icon, 20)),
          h('div', { class: 'wf-step-name' },
            h('strong', {}, s ? s.name : ws.step),
            h('span', {}, s ? `from ${s.tool.name}` : 'This tool is not in the toolbox yet')),
          h('div', { class: 'wf-step-btns' },
            h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Move up', onclick: () => move(-1) }, '↑'),
            h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Move down', onclick: () => move(1) }, '↓'),
            h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove step', onclick: () => { wf.steps.splice(i, 1); drawSteps(); } }, icon('x', 16)))),
        s?.options?.length > 0 && h('div', { class: 'wf-opts' },
          s.options.map(o => optionControl(o, ws.opts[o.key] ?? o.value, v => { ws.opts[o.key] = v; }))));
    }));
    if (!wf.steps.length) list.append(h('li', { class: 'field-hint' }, 'No steps yet — add one below.'));
  }
  drawSteps();

  const save = () => {
    const all = store.get().filter(w => w.id !== wf.id);
    const copy = { ...structuredClone(wf), id: isMine ? wf.id : 'wf-' + Date.now().toString(36), name: name.value || 'My workflow' };
    store.set([...all, copy]);
    toast('Saved');
    location.hash = `#/workflows/${copy.id}`;
  };
  const del = () => {
    if (!confirm(`Delete “${wf.name}”?`)) return;
    store.set(store.get().filter(w => w.id !== wf.id));
    location.hash = '#/workflows';
  };

  // Running
  let files = [];
  const picked = h('ul', { class: 'wf-files' });
  const prog = progress();
  const results = h('div', { class: 'wf-results' });
  const runBtn = h('button', { class: 'btn primary', type: 'button', disabled: true }, icon('play', 18), ' Run');
  const showPicked = () => {
    picked.replaceChildren(...files.map(f => h('li', {}, h('span', {}, f.name), h('span', { class: 'field-hint' }, fmtBytes(f.size)))));
    runBtn.disabled = !files.length || !wf.steps.length;
  };
  const drop = dropzone({ multiple: true, label: 'Drop the files to run this on, or tap to choose', onfiles: f => { files = f; showPicked(); } });
  runBtn.onclick = async () => {
    runBtn.disabled = true;
    results.replaceChildren();
    try {
      const out = await runWorkflow(wf, files, (v, l) => { prog.set(v); prog.label(l); });
      showResults(out);
    } catch (e) {
      prog.label('✗ ' + (e.message || e));
      console.warn(e);
    } finally {
      runBtn.disabled = false;
    }
  };
  function showResults(out) {
    const total = out.reduce((n, f) => n + f.size, 0);
    const before = files.reduce((n, f) => n + f.size, 0);
    results.replaceChildren(
      h('div', { class: 'row' },
        h('strong', {}, `${out.length} file${out.length === 1 ? '' : 's'} · ${fmtBytes(total)}`),
        before && h('span', { class: 'field-hint' }, `was ${fmtBytes(before)}`),
        out.length > 1 && h('button', {
          class: 'btn small primary', type: 'button', onclick: async () => {
            const { zipSync } = await import('../vendor/fflate.js');
            const entries = {};
            for (const f of out) {
              let n = f.name, k = 1;
              while (entries[n]) n = f.name.replace(/(\.[^.]+)?$/, ` (${++k})$1`);
              entries[n] = [new Uint8Array(await f.arrayBuffer()), { level: 0 }];
            }
            download((wf.name || 'workflow').replace(/[^\w-]+/g, '-').toLowerCase() + '.zip', new Blob([zipSync(entries)], { type: 'application/zip' }));
          },
        }, 'Download all (.zip)')),
      h('ul', { class: 'wf-files out' }, out.map(f => h('li', {},
        f.type.startsWith('image/') ? h('img', { src: URL.createObjectURL(f), alt: '', class: 'wf-thumb' }) : h('span', { class: 'tool-icon' }, icon('file-down', 20)),
        h('span', {}, f.name),
        h('span', { class: 'field-hint' }, fmtBytes(f.size)),
        h('span', { class: 'row' },
          h('button', { class: 'btn small primary', type: 'button', onclick: () => download(f.name, f) }, 'Download'),
          sendBtn(() => ({ files: [f] })))))));
  }

  main.replaceChildren(
    head(wf.name, wf.desc || 'Your own chain of tools.'),
    h('div', { class: 'tool-body' },
      card(h('h3', {}, '1. Files'), drop, picked),
      card(h('h3', {}, '2. Steps'),
        isMine && field('Name', name),
        list,
        addSel,
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: save }, isMine ? 'Save changes' : 'Save as my workflow'),
          isMine && h('button', { class: 'btn ghost', type: 'button', onclick: del }, 'Delete'))),
      card(h('h3', {}, '3. Run'), runBtn, prog.el, results)));
  document.title = `${wf.name} · Workflows · The Toolbox`;
}
