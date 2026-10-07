// Small DOM helpers shared by every tool. No framework: each tool builds its
// panel with h() and wires inputs to outputs with plain event listeners.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) document.body.append(t = h('div', { id: 'toast', role: 'status' }));
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older iOS / insecure origins: fall back to a hidden textarea.
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied');
}

export function copyBtn(getText, label = 'Copy') {
  return h('button', {
    class: 'btn small', type: 'button',
    onclick: () => { const t = getText(); if (t) copy(t); },
  }, label);
}

const canPaste = !!navigator.clipboard?.readText;

// One-tap paste into a box — long-pressing a textarea on a phone is slow.
export function pasteBtn(target) {
  if (!canPaste) return null;
  return h('button', {
    class: 'btn small ghost', type: 'button',
    onclick: async e => {
      e.preventDefault();
      try {
        target.value = await navigator.clipboard.readText();
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus();
      } catch { toast('Paste was blocked — long-press the box instead'); }
    },
  }, 'Paste');
}

const pasteable = c => c instanceof HTMLElement && !c.readOnly &&
  (c.tagName === 'TEXTAREA' || (c.tagName === 'INPUT' && c.type === 'text' && c.classList.contains('mono')));

export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-head' },
      h('span', { class: 'field-label' }, label),
      pasteable(control) && pasteBtn(control)),
    control,
    hint && h('span', { class: 'field-hint' }, hint));
}

export function textarea(opts = {}) {
  return h('textarea', {
    class: 'input' + (opts.mono !== false ? ' mono' : ''),
    rows: opts.rows || 5,
    placeholder: opts.placeholder || '',
    value: opts.value || '',
    readOnly: !!opts.readonly,
    spellcheck: false,
    autocapitalize: 'off',
    autocomplete: 'off',
  });
}

export function input(opts = {}) {
  return h('input', {
    class: 'input' + (opts.mono ? ' mono' : ''),
    type: opts.type || 'text',
    value: opts.value ?? '',
    placeholder: opts.placeholder || '',
    min: opts.min, max: opts.max, step: opts.step,
    spellcheck: false,
    autocapitalize: 'off',
    autocomplete: 'off',
  });
}

export function select(options, value) {
  const s = h('select', { class: 'input' },
    options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v }, l);
    }));
  if (value != null) s.value = value;
  return s;
}

export function checkbox(label, checked = false) {
  const box = h('input', { type: 'checkbox', checked });
  const wrap = h('label', { class: 'check' }, box, h('span', {}, label));
  wrap.input = box;
  return wrap;
}

// A read-only result line or block with its own copy button.
export function output(label, { multiline = false, rows = 4 } = {}) {
  const val = multiline ? textarea({ rows, readonly: true }) : input({ mono: true });
  if (!multiline) val.readOnly = true;
  const el = h('div', { class: 'output' },
    h('div', { class: 'output-head' },
      h('span', { class: 'field-label' }, label),
      copyBtn(() => val.value)),
    val);
  return { el, set: v => { val.value = v ?? ''; }, get: () => val.value, input: val };
}

// Message line under an input, for parse errors and the like.
export function note() {
  const el = h('div', { class: 'note', hidden: true });
  return {
    el,
    error(msg) { el.hidden = !msg; el.className = 'note error'; el.textContent = msg || ''; },
    info(msg) { el.hidden = !msg; el.className = 'note'; el.textContent = msg || ''; },
    clear() { el.hidden = true; },
  };
}

export const row = (...c) => h('div', { class: 'row' }, ...c);
export const card = (...c) => h('section', { class: 'card' }, ...c);
export const grid = (...c) => h('div', { class: 'grid2' }, ...c);

// Segmented control: returns an element with .value and fires onchange.
export function tabs(options, value, onchange) {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  const set = v => {
    el.value = v;
    for (const b of el.children) b.classList.toggle('on', b.dataset.v === v);
  };
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    el.append(h('button', {
      type: 'button', 'data-v': v, role: 'tab',
      onclick: () => { set(v); onchange?.(v); },
    }, l));
  }
  set(value ?? (Array.isArray(options[0]) ? options[0][0] : options[0]));
  el.set = set;
  return el;
}

// Run fn now and whenever any of els changes. A delay (ms) waits for typing to
// pause first — for tools that are slow on big text (diff, JSON, regex).
export function on(els, fn, ev = 'input', delay = 0) {
  let timer;
  const run = delay ? () => { clearTimeout(timer); timer = setTimeout(fn, delay); } : fn;
  for (const e of [].concat(els)) e.addEventListener(ev, run);
  fn();
}

export function download(name, blobOrUrl) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}
