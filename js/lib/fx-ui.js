// Small UI pieces shared by the image-effects tools.
import { h, row, download, toast } from '../ui.js';
import { sendBtn } from '../hub.js';

// A range with its value shown next to the label. fmt turns the number into text.
export function slider(label, { min = 0, max = 100, step = 1, value = 50, fmt = v => v, hint } = {}) {
  const inp = h('input', { type: 'range', min, max, step, value });
  const out = h('span', { class: 'fx-val' }, fmt(+value));
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); });
  const el = h('label', { class: 'field' },
    h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, label), out),
    inp,
    hint && h('span', { class: 'field-hint' }, hint));
  return { el, input: inp, get value() { return +inp.value; } };
}

export function colourField(label, value = '#ffffff') {
  const inp = h('input', { type: 'color', class: 'swatch-input', value });
  return { el: h('label', { class: 'field fx-colour' }, h('span', { class: 'field-label' }, label), inp), input: inp, get value() { return inp.value; } };
}

// Download + Send to… for a result. getFile returns a File (or null).
export function actions(getFile, label = 'Download') {
  const save = h('button', {
    class: 'btn small primary', type: 'button',
    onclick: async () => {
      try { const f = await getFile(); if (f) download(f.name, f); }
      catch (e) { toast(e.message || 'Could not save'); }
    },
  }, label);
  return row(save,
    sendBtn(async () => { const f = await getFile(); return f ? { files: [f] } : null; }));
}

// Canvas shown scaled down inside .fx-stage, on a chequerboard so transparency shows.
export function stage(extraClass = '') {
  return h('div', { class: 'fx-stage fx-checker ' + extraClass });
}

export function show(stageEl, c) {
  c.classList.add('fx-canvas');
  stageEl.replaceChildren(c);
}
