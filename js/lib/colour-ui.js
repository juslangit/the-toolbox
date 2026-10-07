// Small UI pieces shared by the Colour drawer: swatches you can copy and send on,
// and a colour field (text + native picker) that stays in sync.
import { h, copy, field, input } from '../ui.js';
import { sendBtn, sendTo } from '../hub.js';
import { parse, toHex, inkOn } from './colour-maths.js';

export const hexOf = c => (typeof c === 'string' ? (parse(c) ? toHex(parse(c)) : c) : toHex(c));

// A swatch tile: tap to copy its hex, plus a Send button. label is shown under the hex.
export function swatch(c, { label, big = false, send = true, onpick } = {}) {
  const hex = hexOf(c);
  const tile = h('button', {
    type: 'button', class: 'cz-tile', title: `Copy ${hex}`,
    style: { background: hex, color: inkOn(parse(hex)) },
    onclick: () => (onpick ? onpick(hex) : copy(hex)),
  }, h('span', { class: 'cz-hex' }, hex));
  const el = h('div', { class: 'cz-sw' + (big ? ' big' : ''), 'data-hex': hex },
    tile,
    (label || send) && h('div', { class: 'cz-sw-foot' },
      label ? h('span', { class: 'cz-sw-label' }, label) : h('span'),
      send && sendColourBtn(hex)));
  return el;
}

export function sendColourBtn(hex) {
  const b = sendBtn(() => ({ colour: typeof hex === 'function' ? hex() : hex }), '');
  b.classList.add('cz-send');
  b.title = 'Send this colour to another tool';
  b.setAttribute('aria-label', 'Send this colour to another tool');
  return b;
}

export const swatchRow = (colours, opts = {}, labels = []) =>
  h('div', { class: 'cz-row' + (opts.tight ? ' tight' : '') }, colours.map((c, i) => swatch(c, { ...opts, label: labels[i] ?? opts.label })));

// Text box + native colour picker. onchange(colour) runs on every valid edit.
export function colourField(label, value, onchange, hint) {
  const text = input({ value, mono: true, placeholder: '#e8a33d, rgb(…), oklch(…), teal' });
  const picker = h('input', { type: 'color', class: 'swatch-input', value: hexOf(value), 'aria-label': `Pick ${label.toLowerCase()}` });
  const f = field(label, text, hint);
  const el = h('div', { class: 'cz-field' }, f, picker);
  const api = {
    el, text, picker,
    get colour() { return parse(text.value); },
    set(v, fire = true) { text.value = typeof v === 'string' ? v : toHex(v); sync(); if (fire) onchange?.(api.colour); },
  };
  function sync() { const c = parse(text.value); text.classList.toggle('cz-bad', !c); if (c) picker.value = toHex(c); }
  text.addEventListener('input', () => { sync(); const c = parse(text.value); if (c) onchange?.(c); });
  picker.addEventListener('input', () => { text.value = picker.value; text.classList.remove('cz-bad'); onchange?.(parse(picker.value)); });
  sync();
  return api;
}

// A row of buttons that open this colour in other tools of the drawer.
export function openIn(getHex, list) {
  return h('div', { class: 'chips' }, list.map(([id, label]) =>
    h('button', { type: 'button', class: 'chip', onclick: () => sendTo(id, { colour: getHex() }) }, label)));
}

