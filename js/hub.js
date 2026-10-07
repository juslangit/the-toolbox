// Hand-offs between tools. A tool says what it can open with `accepts`:
//   'image/*'  a MIME family      'application/pdf'  an exact type
//   '.srt'     a file extension    'file'             any file
//   'text'     plain text          'colour'           a colour (#rrggbb)
// A payload is { files: [File] } or { text } or { colour }.
// sendTo() opens a tool with a payload; the tool gets it as render(root, incoming).
import { h } from './ui.js';
import { icon } from './icons.js';

export const hub = {
  tools: [],          // filled in by app.js
  incoming: null,     // the payload waiting for the next tool to open
  reopen: null,       // app.js: re-render the current tool (same URL)
};

function fileMatches(f, pattern) {
  if (pattern === 'file') return true;
  if (pattern.startsWith('.')) return f.name.toLowerCase().endsWith(pattern);
  if (pattern.endsWith('/*')) return (f.type || '').startsWith(pattern.slice(0, -1));
  return f.type === pattern;
}

// Does this tool take this payload?
export function accepts(tool, payload) {
  const list = tool.accepts || [];
  if (!payload || !list.length) return false;
  if (payload.files?.length) return payload.files.every(f => list.some(p => p !== 'text' && p !== 'colour' && fileMatches(f, p)));
  if (payload.colour) return list.includes('colour');
  if (payload.text != null) return list.includes('text');
  return false;
}

// Tools that can open a payload. Atlas pages ("everything about one …") first.
export function receivers(payload, exceptId) {
  return hub.tools
    .filter(t => t.id !== exceptId && accepts(t, payload))
    .sort((a, b) => (b.atlas ? 1 : 0) - (a.atlas ? 1 : 0));
}

export function sendTo(id, payload) {
  hub.incoming = payload;
  if (location.hash === `#/tool/${id}`) hub.reopen?.();
  else location.hash = `#/tool/${id}`;
}

// Called by app.js when a tool opens; hands over the waiting payload once.
export function takeIncoming() {
  const p = hub.incoming;
  hub.incoming = null;
  return p;
}

// Plain text or a file that is really text, for tools that accept 'text'.
export async function textOf(payload) {
  if (!payload) return null;
  if (payload.text != null) return payload.text;
  if (payload.files?.[0]) return payload.files[0].text();
  return null;
}

const describe = p =>
  p.files ? (p.files.length === 1 ? p.files[0].name : `${p.files.length} files`)
    : p.colour ? p.colour : 'this text';

// A sheet listing the tools that can open a payload.
export function pickTool(payload, { title, exceptId } = {}) {
  const list = receivers(payload, exceptId);
  document.querySelector('.sheet-wrap')?.remove();
  const close = () => { wrap.remove(); removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title || 'Open with' },
      h('div', { class: 'sheet-head' },
        h('div', {},
          h('strong', {}, title || 'Open with…'),
          h('span', { class: 'sheet-sub' }, describe(payload))),
        h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x', 18))),
      list.length
        ? h('div', { class: 'sheet-list' }, list.map(t =>
          h('button', { type: 'button', class: 'sheet-item', 'data-group': t.group, onclick: () => { close(); sendTo(t.id, payload); } },
            h('span', { class: 'tool-icon' }, icon(t.icon, 22)),
            h('span', { class: 'tool-text' }, h('strong', {}, t.name), h('span', {}, t.desc)))))
        : h('p', { class: 'field-hint' }, 'No tool here can open that yet.')));
  document.body.append(wrap);
  addEventListener('keydown', esc);
  wrap.querySelector('.sheet-item')?.focus();
  return wrap;
}

// "Send to…" button. getPayload may be async (e.g. waiting for canvas.toBlob)
// and may return null when there is nothing to send yet.
export function sendBtn(getPayload, label = 'Send to…') {
  return h('button', {
    class: 'btn small', type: 'button', title: 'Open this result in another tool',
    onclick: async () => {
      const p = await getPayload();
      if (!p) return;
      const here = location.hash.match(/^#\/tool\/([\w-]+)/)?.[1];
      pickTool(p, { title: 'Send to…', exceptId: here });
    },
  }, icon('send', 16), ' ', label);
}

// Turns a canvas or Blob into a File with a name, for payloads.
export async function asFile(blobOrCanvas, name, type = 'image/png') {
  const blob = blobOrCanvas instanceof Blob ? blobOrCanvas
    : await new Promise(r => blobOrCanvas.toBlob(r, type));
  return new File([blob], name, { type: blob.type || type });
}
