// UI pieces shared by the video tools: a file slot, a player, a trim timeline
// with touch-sized handles, and a result box with Download + Send to.
import { h, dropzone, downloadBtn, fmtBytes, note } from '../ui.js';
import { sendBtn } from '../hub.js';
import { VIDEO_INPUT, fmtTime } from './video-core.js';
import { bigEngineCard } from './video-ffmpeg.js';

// A drop zone plus a line naming the loaded file. load(file) is the tool's
// loader; errors that need ffmpeg get the big-engine card automatically.
export function videoSlot({ label, accept = VIDEO_INPUT, onfile }) {
  const err = note();
  const name = h('div', { class: 'vid-name', hidden: true });
  const extra = h('div');
  const dz = dropzone({ accept, label: label || 'Drop a video here, or tap to choose one', onfiles: f => load(f[0]) });
  const el = h('div', { class: 'stack' }, dz, name, err.el, extra);
  let current = null;
  async function load(file) {
    if (!file) return;
    err.clear(); extra.replaceChildren();
    current = file;
    name.hidden = false;
    name.replaceChildren(h('strong', {}, file.name), h('span', {}, ' · ' + fmtBytes(file.size)));
    dz.querySelector('span').textContent = 'Choose a different video';
    dz.classList.add('vid-drop-small');
    try { await onfile(file); }
    catch (e) {
      if (current !== file) return;
      if (e?.bigEngine) bigEngineCard(extra, file, e.message, mp4 => load(mp4));
      else err.error(e?.message || String(e));
    }
  }
  return { el, load, err, get file() { return current; } };
}

export function player(cls = 'vid-player') {
  const v = h('video', { class: cls, controls: true, playsInline: true, preload: 'metadata' });
  v.setAttribute('playsinline', '');
  let url = null;
  v.setFile = f => { if (url) URL.revokeObjectURL(url); url = f ? URL.createObjectURL(f) : null; if (url) v.src = url; else v.removeAttribute('src'); };
  v.dispose = () => { v.pause(); if (url) URL.revokeObjectURL(url); url = null; };
  return v;
}

// A finished file: preview, size, Download and Send to.
export function resultBox() {
  const el = h('section', { class: 'card vid-result', hidden: true });
  let url = null, file = null;
  return {
    el,
    get file() { return file; },
    show(f, { line, kind } = {}) {
      file = f;
      el.file = f; // handy for checks and for debugging in the console
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(f);
      const k = kind || (f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'file');
      const prev = k === 'image' ? h('img', { class: 'vid-out-img', src: url, alt: 'Result' })
        : k === 'video' ? h('video', { class: 'vid-player', src: url, controls: true, playsInline: true })
          : k === 'audio' ? h('audio', { src: url, controls: true, class: 'vid-audio' }) : null;
      el.hidden = false;
      el.replaceChildren(
        h('h3', {}, 'Result'),
        prev,
        h('p', { class: 'vid-meta' }, h('strong', {}, f.name), ` · ${fmtBytes(f.size)}`, line ? ` · ${line}` : ''),
        h('div', { class: 'row tight' }, downloadBtn(f.name, () => f), sendBtn(() => ({ files: [f] }))));
    },
    hide() { el.hidden = true; file = null; },
    dispose() { if (url) URL.revokeObjectURL(url); },
  };
}

// Timeline with in/out handles and a playhead. Drag a handle to set a point;
// tap or drag elsewhere on the track to move the playhead.
export function timeline({ duration = 1, start = 0, end, onchange, onseek }) {
  let d = duration, a = start, b = end ?? duration, head = 0;
  const thumbs = h('div', { class: 'vt-thumbs' });
  const sel = h('div', { class: 'vt-sel' });
  const hin = h('button', { type: 'button', class: 'vt-handle vt-in', 'aria-label': 'Start point' });
  const hout = h('button', { type: 'button', class: 'vt-handle vt-out', 'aria-label': 'End point' });
  const ph = h('div', { class: 'vt-head' });
  const track = h('div', { class: 'vt-track' }, thumbs, sel, ph, hin, hout);
  const lab = h('div', { class: 'vt-labels' }, h('span'), h('span'), h('span'));
  const el = h('div', { class: 'vt' }, track, lab);
  const pct = t => (d ? t / d * 100 : 0) + '%';
  function paint() {
    hin.style.left = pct(a); hout.style.left = pct(b);
    sel.style.left = pct(a); sel.style.width = (d ? (b - a) / d * 100 : 0) + '%';
    ph.style.left = pct(head);
    lab.children[0].textContent = fmtTime(a);
    lab.children[1].textContent = `length ${fmtTime(b - a)}`;
    lab.children[2].textContent = fmtTime(b);
  }
  const tAt = e => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d; };
  function drag(target, move) {
    target.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      move(tAt(e));
      const mv = ev => move(tAt(ev));
      const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
      target.addEventListener('pointermove', mv);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
  }
  const minLen = () => Math.min(0.05, d / 10);
  drag(hin, t => { a = Math.min(t, b - minLen()); paint(); onchange?.(a, b, 'in'); onseek?.(a); });
  drag(hout, t => { b = Math.max(t, a + minLen()); paint(); onchange?.(a, b, 'out'); onseek?.(b); });
  drag(track, t => { head = t; paint(); onseek?.(t); });
  // Arrow keys nudge a focused handle by 1/10 s.
  for (const [btn, which] of [[hin, 'in'], [hout, 'out']]) btn.addEventListener('keydown', e => {
    const step = e.shiftKey ? 1 : 0.1;
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (which === 'in') a = Math.max(0, Math.min(a + dir * step, b - minLen())); else b = Math.min(d, Math.max(b + dir * step, a + minLen()));
    paint(); onchange?.(a, b, which);
  });
  paint();
  return {
    el,
    get start() { return a; }, get end() { return b; },
    set(s, e2, dur) { if (dur != null) d = dur; a = Math.max(0, Math.min(s, d)); b = Math.max(a, Math.min(e2, d)); paint(); },
    setHead(t) { head = t; paint(); },
    setThumbs(canvases) { thumbs.replaceChildren(...canvases.filter(Boolean).map(c => { c.className = 'vt-thumb'; return c; })); },
  };
}

// Small helper: a number input labelled in seconds.
export function secondsInput(value, { min = 0, max, step = 0.01 } = {}) {
  return h('input', { class: 'input mono', type: 'number', value, min, max, step, inputMode: 'decimal' });
}
