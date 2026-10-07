// Audio half of the Audio & video drawer: atlas, trimmer, normaliser,
// recorder, waveform pictures, subtitles, timecode and on-device transcription.
import { h, field, input, textarea, select, checkbox, output, note, row, card, grid, tabs, on, download,
  dropzone, downloadBtn, fmtBytes, rename, progress, toast } from '../ui.js';
import { sendBtn, asFile, textOf } from '../hub.js';
import { askToFetch, markFetched, transformers } from '../lib/heavy.js';
import { decodeAudio, encodeWav, wavFile, makeBuffer, channelsOf, toAudioBuffer, toMonoRate, resample, fmtTime } from '../lib/audio-wav.js';
import { measure, normalise, db } from '../lib/audio-meter.js';
import { sniff } from '../lib/audio-sniff.js';
import { parseSubs, toSrt, toVtt, adjustSubs, countOverlaps, fmtSubTime, RATES, rate as rateOf, tcToFrames, framesToTc } from '../lib/audio-subs.js';

const AUDIO = ['audio/*', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.aiff', '.caf'];
const VIDEO = ['video/*', '.mp4', '.mov', '.m4v', '.webm', '.mkv'];
const ACCEPT_AUDIO = AUDIO.join(',');

// --- shared bits -------------------------------------------------------------
async function loadAudio(file) {
  const info = await sniff(file);
  const buf = await decodeAudio(file, info.sampleRate);
  return { buf, info };
}

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const dbText = (v, unit = 'dBFS', digits = 1) => (isFinite(v) ? `${v.toFixed(digits)} ${unit}` : `−∞ ${unit}`);
const secs = s => `${s.toFixed(2)} s`;

// Loudest absolute value in each of n slices (all channels together).
function peaks(buf, n) {
  const ch = channelsOf(buf), len = buf.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * len / n), b = Math.max(a + 1, Math.floor((i + 1) * len / n));
    let m = 0;
    for (const x of ch) for (let j = a; j < b && j < len; j++) { const v = x[j] < 0 ? -x[j] : x[j]; if (v > m) m = v; }
    out[i] = m;
  }
  return out;
}
function rmsSlices(buf, n) {
  const ch = channelsOf(buf), len = buf.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * len / n), b = Math.max(a + 1, Math.floor((i + 1) * len / n));
    let s = 0, k = 0;
    for (const x of ch) for (let j = a; j < b && j < len; j++) { s += x[j] * x[j]; k++; }
    out[i] = Math.sqrt(s / Math.max(1, k));
  }
  return out;
}

// Mirrored waveform on a canvas, sized to its box.
function drawWave(canvas, buf, { colour } = {}) {
  const dpr = devicePixelRatio || 1;
  const w = Math.max(50, Math.round(canvas.clientWidth * dpr)), hh = Math.max(40, Math.round(canvas.clientHeight * dpr));
  canvas.width = w; canvas.height = hh;
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, w, hh);
  const p = peaks(buf, w), r = rmsSlices(buf, Math.min(w, 2000));
  const mid = hh / 2;
  x.fillStyle = colour || cssVar('--g-media', '#7fa7e8');
  x.globalAlpha = 0.45;
  for (let i = 0; i < w; i++) { const y = Math.max(0.5, p[i] * mid); x.fillRect(i, mid - y, 1, y * 2); }
  x.globalAlpha = 1;
  for (let i = 0; i < w; i++) { const y = Math.max(0.5, r[Math.floor(i * r.length / w)] * mid); x.fillRect(i, mid - y, 1, y * 2); }
}

// In-place radix-2 FFT.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const RAMP = [[12, 8, 20], [60, 20, 90], [150, 40, 110], [230, 90, 60], [250, 190, 80], [255, 250, 220]];
function rampColour(t) {
  t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
  return RAMP[i].map((v, k) => v + (RAMP[i + 1][k] - v) * f);
}

// Spectrogram with a log frequency axis (40 Hz to Nyquist).
function drawSpectrogram(canvas, buf) {
  const cols = Math.min(900, Math.max(100, Math.round(canvas.clientWidth || 600)));
  const rows = 200, N = buf.sampleRate > 60000 ? 4096 : 2048;
  const ch = channelsOf(buf), len = buf.length, nyq = buf.sampleRate / 2;
  const img = new ImageData(cols, rows);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  const re = new Float32Array(N), im = new Float32Array(N);
  const lo = Math.log(40), hi = Math.log(nyq);
  const binFor = Array.from({ length: rows }, (_, r) => Math.min(N / 2 - 1, Math.round(Math.exp(lo + (hi - lo) * (1 - r / (rows - 1))) / nyq * (N / 2))));
  const scale = 4 / N;
  for (let c = 0; c < cols; c++) {
    const start = Math.floor((c / cols) * Math.max(0, len - N));
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (const x of ch) s += x[start + i] || 0;
      re[i] = (s / ch.length) * win[i]; im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      const b = binFor[r];
      const lo2 = r < rows - 1 ? binFor[r + 1] : b;
      let m = 0;
      for (let k = Math.min(b, lo2); k <= Math.max(b, lo2); k++) { const v = re[k] * re[k] + im[k] * im[k]; if (v > m) m = v; }
      const dB = 10 * Math.log10(m * scale * scale + 1e-20);
      const [R, G, B] = rampColour((dB + 110) / 110);
      const o = (r * cols + c) * 4;
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
    }
  }
  canvas.width = cols; canvas.height = rows;
  canvas.getContext('2d').putImageData(img, 0, 0);
}

function player(file, urls) {
  const url = URL.createObjectURL(file);
  urls.push(url);
  return h('audio', { controls: true, src: url, preload: 'metadata', class: 'au-player' });
}

// Redraws when the box changes size (rotation, sidebar).
function watchSize(el, fn) {
  if (!globalThis.ResizeObserver) return () => {};
  let w = 0, t;
  const ro = new ResizeObserver(([e]) => {
    const nw = Math.round(e.contentRect.width);
    if (nw && nw !== w) { const first = !w; w = nw; if (!first) { clearTimeout(t); t = setTimeout(fn, 120); } }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

const ok = (v, good, warn) => (v ? good : warn);

// --- 1. Audio Atlas ------------------------------------------------------------
const atlas = {
  id: 'audio-atlas', name: 'Audio Atlas', group: 'media', icon: 'file-audio', atlas: true,
  desc: 'Everything about one audio file: format, length, levels, loudness, clipping, waveform and spectrogram.',
  keywords: 'audio info inspect metadata lufs loudness peak rms bitrate sample rate codec spectrogram waveform tags id3 cover',
  accepts: [...AUDIO, ...VIDEO],
  render(root, incoming) {
    const urls = [], stops = [];
    const status = note();
    const prog = progress();
    const out = h('div', { class: 'au-stack' });
    const dz = dropzone({ accept: [ACCEPT_AUDIO, ...VIDEO].join(','), label: 'Drop an audio file here, or tap to choose one', onfiles: f => open(f[0]) });
    root.append(card(dz, prog.el, status.el), out);

    async function open(file) {
      out.replaceChildren(); status.clear(); stops.splice(0).forEach(f => f());
      prog.set(0.2); prog.label('Reading the file…');
      let buf, info;
      try { ({ buf, info } = await loadAudio(file)); } catch (e) { prog.hide(); status.error(e.message + '. Try a WAV, MP3, M4A, FLAC or Ogg file.'); return; }
      prog.set(0.6); prog.label('Measuring levels and loudness…');
      await new Promise(r => setTimeout(r, 20));
      const m = measure(buf);
      prog.hide();
      const duration = buf.duration;
      const kbps = file.size * 8 / duration / 1000;
      const nch = buf.numberOfChannels;
      const chName = { 1: 'mono', 2: 'stereo', 6: '5.1' }[nch] || `${nch} channels`;
      const kv = h('dl', { class: 'kv wide' });
      const add = (k, label, v) => { if (v != null && v !== '') kv.append(h('dt', {}, label), h('dd', { 'data-k': k }, v)); };
      add('name', 'File', file.name);
      add('size', 'File size', `${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)`);
      add('duration', 'Duration', `${secs(duration)} (${fmtTime(duration)})`);
      add('container', 'Container', info.container || file.type || 'unknown');
      add('codec', 'Codec', info.codec ? info.codec + (info.lossless ? ' — lossless' : info.lossless === false ? ' — lossy' : '') : 'could not tell from the header');
      add('rate', 'Sample rate', `${((info.sampleRate || buf.sampleRate) / 1000).toLocaleString()} kHz` + (info.sampleRate && info.sampleRate !== buf.sampleRate ? ` (decoded at ${buf.sampleRate / 1000} kHz)` : ''));
      add('channels', 'Channels', `${nch} — ${chName}${info.channelMode && info.channelMode !== 'Mono' ? ` (${info.channelMode.toLowerCase()})` : ''}`);
      add('bits', 'Bit depth', info.bitDepth ? `${info.bitDepth}-bit` : null);
      add('bitrate', 'Average bitrate', `${Math.round(kbps).toLocaleString()} kbps` + (info.vbr ? ' (variable)' : info.nominalBitrate ? ` (encoded at ${Math.round(info.nominalBitrate / 1000)} kbps)` : ''));
      add('peak', 'Peak', dbText(m.peakDb));
      add('truepeak', 'True peak', dbText(m.truePeakDb, 'dBTP'));
      add('rms', 'RMS', dbText(m.rmsDb));
      add('lufs', 'Integrated loudness', dbText(m.lufs, 'LUFS'));
      add('lra', 'Loudness range', isFinite(m.lufs) ? `${m.lra.toFixed(1)} LU` : '–');
      add('clip', 'Clipping', m.clipped ? `${m.clipped.toLocaleString()} samples at full scale (${m.clipRuns.toLocaleString()} runs of 3+)` : 'none');
      if (Math.abs(m.dcOffset) > 0.001) add('dc', 'DC offset', `${(m.dcOffset * 100).toFixed(2)} %`);
      if (info.hasVideo) add('video', 'Video', 'this file also has a video track (only the sound is shown here)');
      const tags = Object.entries(info.tags || {}).filter(([, v]) => v);
      const tagKv = tags.length ? h('dl', { class: 'kv wide' }, tags.flatMap(([k, v]) => [h('dt', {}, k[0].toUpperCase() + k.slice(1)), h('dd', { 'data-k': 'tag-' + k }, v)])) : null;
      let cover = null;
      if (info.cover) { const u = URL.createObjectURL(info.cover); urls.push(u); cover = h('img', { src: u, alt: 'Cover art', class: 'au-cover' }); }

      const tips = h('ul', { class: 'tips' });
      if (m.clipRuns) tips.append(h('li', {}, 'It clips: runs of samples sit at full scale, which usually means distortion. Turning it down now won’t undo it.'));
      if (m.truePeakDb > -1) tips.append(h('li', {}, `True peak is above −1 dBTP — streaming services may distort it when they convert it. The normaliser can pull peaks down.`));
      if (isFinite(m.lufs)) {
        const near = [[-14, 'Spotify / YouTube (−14)'], [-16, 'podcasts and Apple (−16)'], [-23, 'EBU broadcast (−23)']].map(([t, n]) => `${n}: ${(t - m.lufs >= 0 ? '+' : '')}${(t - m.lufs).toFixed(1)} dB`);
        tips.append(h('li', {}, 'To reach the usual targets — ' + near.join(' · ')));
      } else tips.append(h('li', {}, 'Too quiet or too short (under 0.4 s) to measure loudness.'));
      if (info.lossless === false && info.sampleRate && buf.sampleRate !== info.sampleRate) tips.append(h('li', {}, 'This browser could not decode at the file’s own rate, so levels were measured after resampling.'));

      const verdict = h('div', { class: 'verdict ' + (m.clipRuns ? 'bad' : 'good') },
        m.clipRuns ? 'Clipping found' : isFinite(m.lufs) ? 'No clipping' : 'Silent');
      const say = h('p', { class: 'big-say' }, `${secs(duration)} · ${((info.sampleRate || buf.sampleRate) / 1000)} kHz · ${chName} · ${dbText(m.lufs, 'LUFS')}`);
      const wave = h('canvas', { class: 'au-wave-canvas', 'aria-label': 'Waveform' });
      const spec = h('canvas', { class: 'au-spec', 'aria-label': 'Spectrogram' });
      const report = () => [...kv.children].reduce((s, el, i, a) => (el.tagName === 'DT' ? s + `${el.textContent}: ${a[i + 1].textContent}\n` : s), '');
      out.append(
        card(h('div', { class: 'au-head' }, cover, h('div', { class: 'au-head-text' }, say, verdict)), player(file, urls),
          row(sendBtn(() => ({ files: [file] })), h('button', { class: 'btn small', type: 'button', onclick: () => navigator.clipboard?.writeText(report()).then(() => toast('Copied'), () => {}) }, 'Copy report'))),
        card(h('h3', {}, 'Waveform'), wave, h('h3', {}, 'Spectrogram'), spec,
          h('div', { class: 'au-axis' }, h('span', {}, '0:00'), h('span', {}, 'low notes at the bottom, high at the top'), h('span', {}, fmtTime(duration, false)))),
        grid(card(h('h3', {}, 'Details'), kv), card(h('h3', {}, 'What it means'), tips, tagKv && h('h3', {}, 'Tags'), tagKv)));
      requestAnimationFrame(() => { drawWave(wave, buf); drawSpectrogram(spec, buf); });
      stops.push(watchSize(wave, () => drawWave(wave, buf)));
    }
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => { urls.forEach(u => URL.revokeObjectURL(u)); stops.forEach(f => f()); };
  },
};

// --- 2. Audio trimmer ------------------------------------------------------------
async function compressedFormats(buf) {
  if (typeof AudioEncoder === 'undefined') return [];
  try {
    const mb = await import('../../vendor/mediabunny.js');
    const cfg = { numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate, bitrate: 128000 };
    const list = [];
    // AAC encoders only take 44.1 / 48 kHz, so other rates are resampled to 48 kHz first.
    for (const [id, label, ext, type] of [['aac', 'M4A (AAC)', 'm4a', 'audio/mp4'], ['opus', 'WebM (Opus)', 'webm', 'audio/webm']]) {
      if (await mb.canEncodeAudio(id, cfg)) list.push({ id, label, ext, type });
      else if (await mb.canEncodeAudio(id, { ...cfg, sampleRate: 48000 })) list.push({ id, label, ext, type, rate: 48000 });
    }
    return list;
  } catch { return []; }
}
async function encodeCompressed(buf, fmt, bitrate = 128000) {
  const mb = await import('../../vendor/mediabunny.js');
  const out = new mb.Output({ format: fmt.id === 'aac' ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const src = new mb.AudioBufferSource({ codec: fmt.id, bitrate });
  out.addAudioTrack(src);
  await out.start();
  await src.add(fmt.rate ? await resample(buf, fmt.rate) : toAudioBuffer(buf));
  await out.finalize();
  return new Blob([out.target.buffer], { type: fmt.type });
}

function cut(buf, from, to, fadeIn = 0, fadeOut = 0) {
  const r = buf.sampleRate;
  const a = Math.max(0, Math.round(from * r)), b = Math.min(buf.length, Math.round(to * r));
  const n = Math.max(1, b - a), fi = Math.min(n, Math.round(fadeIn * r)), fo = Math.min(n, Math.round(fadeOut * r));
  const ch = channelsOf(buf).map(x => {
    const y = x.slice(a, a + n);
    for (let i = 0; i < fi; i++) y[i] *= Math.sin((i / fi) * Math.PI / 2) ** 2;
    for (let i = 0; i < fo; i++) y[n - 1 - i] *= Math.sin((i / fo) * Math.PI / 2) ** 2;
    return y;
  });
  return makeBuffer(ch, r);
}

// Plays a buffer; returns { stop, at() } where at() is seconds into it.
let sharedCtx;
function play(buf, onend) {
  sharedCtx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  sharedCtx.resume?.();
  const s = sharedCtx.createBufferSource();
  s.buffer = toAudioBuffer(buf);
  s.connect(sharedCtx.destination);
  const t0 = sharedCtx.currentTime;
  s.onended = onend;
  s.start();
  return { stop: () => { s.onended = null; try { s.stop(); } catch {} }, at: () => sharedCtx.currentTime - t0 };
}

const trimmer = {
  id: 'audio-trim', name: 'Audio trimmer', group: 'media', icon: 'scissors',
  desc: 'Cut a clip out of a recording or song, fade it in and out, save as WAV (or M4A/WebM where the browser can).',
  keywords: 'audio trim cut clip crop fade ringtone shorten mp3 wav',
  accepts: AUDIO,
  render(root, incoming) {
    const urls = [], stops = [];
    let buf = null, file = null, playing = null, raf = 0, formats = [];
    const status = note();
    const dz = dropzone({ accept: ACCEPT_AUDIO, label: 'Drop an audio file here, or tap to choose one', onfiles: f => open(f[0]) });
    const canvas = h('canvas', { class: 'au-wave-canvas' });
    const shadeL = h('div', { class: 'au-shade' }), shadeR = h('div', { class: 'au-shade' });
    const head = h('div', { class: 'au-playhead', hidden: true });
    const mkHandle = label => h('div', { class: 'au-handle', role: 'slider', tabindex: 0, 'aria-label': label }, h('span'));
    const hIn = mkHandle('Start'), hOut = mkHandle('End');
    const wave = h('div', { class: 'au-wave' }, canvas, shadeL, shadeR, head, hIn, hOut);
    const start = input({ type: 'number', value: 0, min: 0, step: 0.01 });
    const end = input({ type: 'number', value: 0, min: 0, step: 0.01 });
    const fadeIn = input({ type: 'number', value: 0, min: 0, step: 0.1 });
    const fadeOut = input({ type: 'number', value: 0, min: 0, step: 0.1 });
    const fmt = select([['wav', 'WAV (16-bit, lossless)']], 'wav');
    const playBtn = h('button', { class: 'btn primary', type: 'button', onclick: toggle }, 'Play selection');
    const say = h('p', { class: 'big-say au-sel' });
    const fmtHint = h('span', { class: 'field-hint' });
    const editor = card(say, wave,
      row(field('Start (s)', start), field('End (s)', end)),
      row(field('Fade in (s)', fadeIn), field('Fade out (s)', fadeOut)),
      row(playBtn), field('Save as', fmt), fmtHint,
      row(downloadBtn(() => rename(file.name, currentFmt().ext, '-trim'), render),
        sendBtn(async () => { const b = await render(); return b && { files: [new File([b], rename(file.name, currentFmt().ext, '-trim'), { type: b.type })] }; })));
    editor.hidden = true;
    root.append(card(dz, status.el), editor);

    const currentFmt = () => formats.find(f => f.id === fmt.value) || { id: 'wav', ext: 'wav', type: 'audio/wav' };
    const sel = () => {
      const d = buf.duration;
      let a = Math.max(0, Math.min(d, +start.value || 0)), b = Math.max(0, Math.min(d, +end.value || d));
      if (b <= a) b = Math.min(d, a + 0.01);
      return [a, b];
    };
    function layout() {
      if (!buf) return;
      const [a, b] = sel(), d = buf.duration;
      const pa = a / d * 100, pb = b / d * 100;
      hIn.style.left = pa + '%'; hOut.style.left = pb + '%';
      shadeL.style.cssText = `left:0;width:${pa}%`; shadeR.style.cssText = `left:${pb}%;right:0`;
      hIn.setAttribute('aria-valuenow', a.toFixed(2)); hOut.setAttribute('aria-valuenow', b.toFixed(2));
      say.textContent = `Keeping ${fmtTime(a)} → ${fmtTime(b)} (${secs(b - a)})`;
    }
    function drag(handle, which) {
      const move = e => {
        const r = wave.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * buf.duration;
        const [a, b] = sel();
        if (which === 'in') start.value = Math.min(t, b - 0.01).toFixed(2);
        else end.value = Math.max(t, a + 0.01).toFixed(2);
        layout();
      };
      handle.addEventListener('pointerdown', e => { e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.onpointermove = move; });
      handle.addEventListener('pointerup', () => { handle.onpointermove = null; start.dispatchEvent(new Event('change', { bubbles: true })); });
      handle.addEventListener('keydown', e => {
        const step = e.shiftKey ? 1 : 0.1, k = { ArrowLeft: -step, ArrowRight: step, ArrowDown: -step, ArrowUp: step }[e.key];
        if (!k) return;
        e.preventDefault();
        const inp = which === 'in' ? start : end;
        inp.value = Math.max(0, (+inp.value || 0) + k).toFixed(2);
        layout();
      });
    }
    drag(hIn, 'in'); drag(hOut, 'out');
    // Tap on the waveform: move the nearer handle there.
    canvas.addEventListener('click', e => {
      const r = wave.getBoundingClientRect(), t = (e.clientX - r.left) / r.width * buf.duration;
      const [a, b] = sel();
      if (Math.abs(t - a) < Math.abs(t - b)) start.value = Math.min(t, b - 0.01).toFixed(2); else end.value = Math.max(t, a + 0.01).toFixed(2);
      layout();
    });
    for (const i of [start, end]) i.addEventListener('input', layout);

    function stopPlay() { playing?.stop(); playing = null; cancelAnimationFrame(raf); head.hidden = true; playBtn.textContent = 'Play selection'; }
    function toggle() {
      if (!buf) return;
      if (playing) return stopPlay();
      const [a, b] = sel();
      playing = play(cut(buf, a, b, +fadeIn.value || 0, +fadeOut.value || 0), stopPlay);
      playBtn.textContent = 'Stop';
      head.hidden = false;
      const tick = () => { if (!playing) return; head.style.left = ((a + Math.min(b - a, playing.at())) / buf.duration * 100) + '%'; raf = requestAnimationFrame(tick); };
      tick();
    }
    async function render() {
      if (!buf) return null;
      const [a, b] = sel();
      const piece = cut(buf, a, b, +fadeIn.value || 0, +fadeOut.value || 0);
      const f = currentFmt();
      if (f.id === 'wav') return encodeWav(piece);
      try { return await encodeCompressed(piece, f); } catch (e) { status.error('Could not encode that format here — saved as WAV instead. ' + e.message); return encodeWav(piece); }
    }
    async function open(f) {
      stopPlay(); status.clear();
      file = f;
      try { ({ buf } = await loadAudio(f)); } catch (e) { status.error(e.message); return; }
      start.value = '0'; end.value = buf.duration.toFixed(2);
      editor.hidden = false;
      requestAnimationFrame(() => { drawWave(canvas, buf); layout(); });
      formats = await compressedFormats(buf);
      fmt.replaceChildren(...[['wav', 'WAV (16-bit, lossless)'], ...formats.map(x => [x.id, x.label])].map(([v, l]) => h('option', { value: v }, l)));
      fmtHint.textContent = formats.length ? 'M4A and WebM are much smaller; WAV keeps every detail.'
        : 'This browser has no built-in audio encoder, so clips are saved as WAV.';
    }
    stops.push(watchSize(wave, () => buf && drawWave(canvas, buf)));
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => { stopPlay(); urls.forEach(u => URL.revokeObjectURL(u)); stops.forEach(f => f()); };
  },
};

// --- 3. Audio normaliser ----------------------------------------------------------
const TARGETS = [['-14', 'Streaming −14'], ['-16', 'Podcast −16'], ['-23', 'Broadcast −23'], ['custom', 'Custom']];
const normaliser = {
  id: 'audio-normaliser', name: 'Audio normaliser', group: 'media', icon: 'gauge',
  desc: 'Measure loudness (LUFS) and true peak, then bring a file to a standard loudness without clipping.',
  keywords: 'normalize normalise loudness lufs ebu r128 podcast volume level gain true peak limiter',
  accepts: AUDIO,
  steps: [
    { id: 'audio-normalise', name: 'Normalise loudness', accepts: [...AUDIO, ...VIDEO],
      options: [
        { key: 'target', label: 'Target loudness (LUFS)', type: 'number', value: -16, min: -40, max: -5, step: 0.5, hint: '−14 streaming, −16 podcasts, −23 broadcast' },
        { key: 'peak', label: 'Peak ceiling (dBTP)', type: 'number', value: -1, min: -12, max: 0, step: 0.1 },
      ],
      async run(files, opts, ctx) {
        const out = [];
        for (const [i, f] of files.entries()) {
          ctx.progress(i / files.length, f.name);
          const { buf } = await loadAudio(f);
          await new Promise(r => setTimeout(r, 0));
          const r = normalise(buf, { target: +opts.target, peak: +opts.peak });
          out.push(wavFile(r.buffer, rename(f.name, 'wav', '-normalised')));
        }
        return out;
      } },
    { id: 'audio-to-wav', name: 'Convert to WAV', accepts: [...AUDIO, ...VIDEO], options: [],
      async run(files, opts, ctx) {
        const out = [];
        for (const [i, f] of files.entries()) {
          ctx.progress(i / files.length, f.name);
          const { buf } = await loadAudio(f);
          out.push(wavFile(buf, rename(f.name, 'wav')));
        }
        return out;
      } },
  ],
  render(root, incoming) {
    const urls = [];
    let buf = null, file = null, result = null, timer;
    const status = note();
    const dz = dropzone({ accept: ACCEPT_AUDIO, label: 'Drop an audio file here, or tap to choose one', onfiles: f => open(f[0]) });
    const target = tabs(TARGETS, '-16', run);
    const custom = input({ type: 'number', value: -16, step: 0.5, min: -40, max: -5 });
    const customF = field('Custom target (LUFS)', custom);
    const peak = input({ type: 'number', value: -1, step: 0.1, min: -12, max: 0 });
    const table = h('table', { class: 'table au-ba' });
    const say = h('p', { class: 'big-say' });
    const tips = h('ul', { class: 'tips' });
    const players = h('div', { class: 'au-players' });
    const prog = progress();
    const res = card(say, table, tips, players,
      row(downloadBtn(() => rename(file.name, 'wav', '-normalised'), () => result && encodeWav(result.buffer), 'Download WAV'),
        sendBtn(() => result && { files: [wavFile(result.buffer, rename(file.name, 'wav', '-normalised'))] })));
    res.hidden = true;
    root.append(card(dz, h('span', { class: 'field-label' }, 'Target'), target, customF, field('Peak ceiling (dBTP)', peak, 'The loudest a peak may get. −1 is the usual safe value.'), prog.el, status.el), res);
    const goal = () => (target.value === 'custom' ? +custom.value : +target.value);
    for (const i of [custom, peak]) i.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });

    async function open(f) {
      file = f; status.clear(); res.hidden = true;
      prog.set(0.3); prog.label('Decoding…');
      try { ({ buf } = await loadAudio(f)); } catch (e) { prog.hide(); status.error(e.message); return; }
      run();
    }
    async function run() {
      customF.hidden = target.value !== 'custom';
      if (!buf) return;
      prog.set(0.7); prog.label('Measuring and adjusting…');
      await new Promise(r => setTimeout(r, 20));
      try { result = normalise(buf, { target: goal(), peak: +peak.value }); } catch (e) { prog.hide(); status.error(e.message); res.hidden = true; return; }
      prog.hide(); status.clear();
      const { before: b, after: a } = result;
      const tr = (k, label, x, y) => h('tr', {}, h('th', {}, label), h('td', { 'data-k': 'before-' + k }, x), h('td', { 'data-k': 'after-' + k }, y));
      table.replaceChildren(
        h('tr', {}, h('th', {}), h('th', {}, 'Before'), h('th', {}, 'After')),
        tr('lufs', 'Loudness', dbText(b.lufs, 'LUFS'), dbText(a.lufs, 'LUFS')),
        tr('tp', 'True peak', dbText(b.truePeakDb, 'dBTP'), dbText(a.truePeakDb, 'dBTP')),
        tr('peak', 'Sample peak', dbText(b.peakDb), dbText(a.peakDb)),
        tr('lra', 'Loudness range', `${b.lra.toFixed(1)} LU`, `${a.lra.toFixed(1)} LU`));
      say.textContent = `${result.gainDb >= 0 ? '+' : ''}${result.gainDb.toFixed(1)} dB → ${dbText(a.lufs, 'LUFS')}`;
      tips.replaceChildren();
      if (result.limitedSamples) tips.append(h('li', {}, `A gentle limiter held ${result.limitedSamples.toLocaleString()} peak samples under ${(+peak.value).toFixed(1)} dBTP so the file could reach the target without clipping.`));
      if (Math.abs(a.lufs - goal()) > 0.5) tips.append(h('li', {}, `Landed ${Math.abs(a.lufs - goal()).toFixed(1)} LU off the target — the peak ceiling would not allow more. Lower the target or raise the ceiling.`));
      if (result.gainDb > 20) tips.append(h('li', {}, 'That is a big boost — background hiss gets louder too.'));
      tips.append(h('li', {}, 'Saved as 16-bit WAV, so nothing is lost on the way out.'));
      urls.splice(0).forEach(u => URL.revokeObjectURL(u));
      players.replaceChildren(
        h('div', {}, h('span', { class: 'field-label' }, 'Before'), player(file, urls)),
        h('div', {}, h('span', { class: 'field-label' }, 'After'), player(new Blob([encodeWav(result.buffer)], { type: 'audio/wav' }), urls)));
      res.hidden = false;
    }
    customF.hidden = true;
    if (incoming?.files?.[0]) open(incoming.files[0]);
    return () => { clearTimeout(timer); urls.forEach(u => URL.revokeObjectURL(u)); };
  },
};

// --- 4. Voice recorder --------------------------------------------------------------
export function peakDb(data) {
  let p = 0;
  for (const v of data) { const a = v < 0 ? -v : v; if (a > p) p = a; }
  return db(p);
}
export function recorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [['audio/webm;codecs=opus', 'webm', 'WebM (Opus)'], ['audio/mp4;codecs=mp4a.40.2', 'm4a', 'MP4 (AAC)'], ['audio/mp4', 'm4a', 'MP4 (AAC)'], ['audio/ogg;codecs=opus', 'ogg', 'Ogg (Opus)'], ['audio/webm', 'webm', 'WebM']];
  const hit = list.find(([t]) => MediaRecorder.isTypeSupported?.(t));
  return hit ? { mime: hit[0], ext: hit[1], label: hit[2] } : { mime: '', ext: 'webm', label: 'the browser’s default format' };
}
const recorder = {
  id: 'voice-recorder', name: 'Voice recorder', group: 'media', icon: 'mic',
  desc: 'Record from the microphone with a level meter, pause and resume, and keep several takes.',
  keywords: 'record microphone voice memo dictaphone audio capture mic takes',
  render(root) {
    const kind = recorderType();
    const status = note();
    const time = h('div', { class: 'au-timer', 'aria-live': 'off' }, '0:00.0');
    const meter = h('div', { class: 'meter big au-level' }, h('i'));
    const levelTxt = h('span', { class: 'field-hint au-level-txt' }, '–∞ dBFS');
    const recBtn = h('button', { class: 'au-rec', type: 'button', 'aria-label': 'Record' }, h('span'));
    const pauseBtn = h('button', { class: 'btn', type: 'button', disabled: true }, 'Pause');
    const takesEl = h('div', { class: 'au-takes' });
    const urls = [];
    let stream, ctx, rec, chunks = [], raf = 0, t0 = 0, acc = 0, n = 0;
    root.append(card(h('div', { class: 'au-recbox' }, recBtn, h('div', { class: 'au-recinfo' }, time, meter, levelTxt)),
      row(pauseBtn),
      h('p', { class: 'field-hint' }, kind ? `Saves as ${kind.label}. Everything stays on this device; takes are gone when you leave the page, so download the ones you want.` : ''),
      status.el), takesEl);
    if (!kind || !navigator.mediaDevices?.getUserMedia) {
      status.error('This browser cannot record audio here. On iPhone use Safari 14.5 or newer; the page must be opened over https.');
      recBtn.disabled = true;
    }
    const elapsed = () => acc + (rec?.state === 'recording' ? performance.now() - t0 : 0);
    function tick(an, data) {
      const ms = elapsed();
      time.textContent = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${Math.floor(ms / 100) % 10}`;
      an.getFloatTimeDomainData(data);
      const d = peakDb(data);
      meter.firstChild.style.width = Math.max(0, Math.min(100, (d + 60) / 60 * 100)) + '%';
      meter.classList.toggle('hot', d > -3);
      levelTxt.textContent = isFinite(d) ? `${d.toFixed(0)} dBFS` : '–∞ dBFS';
      raf = requestAnimationFrame(() => tick(an, data));
    }
    async function startRec() {
      status.clear();
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { status.error(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser’s site settings and try again.' : `No microphone could be opened (${e.message || e.name}).`); return; }
      ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      ctx.resume?.();
      const an = ctx.createAnalyser(); an.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(an);
      chunks = []; acc = 0;
      rec = new MediaRecorder(stream, kind.mime ? { mimeType: kind.mime } : undefined);
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = finish;
      rec.start(250); t0 = performance.now();
      recBtn.classList.add('on'); recBtn.setAttribute('aria-label', 'Stop'); pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
      tick(an, new Float32Array(an.fftSize));
    }
    function finish() {
      cancelAnimationFrame(raf);
      const ms = elapsed();
      const type = rec.mimeType || kind.mime || 'audio/webm';
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      stream.getTracks().forEach(t => t.stop()); if (ctx.state !== 'closed') ctx.close?.().catch(() => {});
      recBtn.classList.remove('on'); recBtn.setAttribute('aria-label', 'Record'); pauseBtn.disabled = true;
      meter.firstChild.style.width = '0';
      rec = null; acc = 0;
      if (!blob.size) { status.error('Nothing was recorded — the microphone sent no sound. Check it is not muted or in use by another app.'); return; }
      n++;
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
      const fileName = `Recording ${n} ${stamp}.${kind.ext}`;
      const f = new File([blob], fileName, { type: blob.type });
      const url = URL.createObjectURL(f); urls.push(url);
      takesEl.prepend(card(h('div', { class: 'au-take-head' }, h('strong', {}, `Take ${n}`), h('span', { class: 'field-hint' }, `${fmtTime(ms / 1000)} · ${fmtBytes(f.size)}`)),
        h('audio', { controls: true, src: url, class: 'au-player' }),
        row(downloadBtn(fileName, () => f), sendBtn(() => ({ files: [f] })))));
    }
    recBtn.onclick = () => (rec ? rec.stop() : startRec());
    pauseBtn.onclick = () => {
      if (!rec) return;
      if (rec.state === 'recording') { rec.pause(); acc += performance.now() - t0; pauseBtn.textContent = 'Resume'; recBtn.classList.add('paused'); }
      else { rec.resume(); t0 = performance.now(); pauseBtn.textContent = 'Pause'; recBtn.classList.remove('paused'); }
    };
    return () => {
      cancelAnimationFrame(raf);
      if (rec) { rec.onstop = null; try { rec.stop(); } catch {} }
      stream?.getTracks().forEach(t => t.stop()); if (ctx && ctx.state !== 'closed') ctx.close?.().catch(() => {});
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  },
};

// --- 5. Waveform generator ------------------------------------------------------------
export function waveSvg(levels, { style = 'bars', width = 1200, height = 240, gap = 30, round = true, colour = '#7fa7e8', bg = '' } = {}) {
  const n = levels.length, slot = width / n, bw = Math.max(1, slot * (1 - gap / 100));
  const minH = Math.max(1, height * 0.02);
  const r = round ? Math.min(bw / 2, 999) : 0;
  const f = v => +v.toFixed(2);
  let body = '';
  if (style === 'line') {
    const pts = [...levels].map((v, i) => `${f(i * slot + slot / 2)},${f(height / 2 + (i % 2 ? 1 : -1) * Math.max(minH / 2, v * height / 2 * 0.96))}`);
    body = `<polyline fill="none" stroke="${colour}" stroke-width="${f(Math.max(1.5, height / 80))}" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/>`;
  } else {
    for (let i = 0; i < n; i++) {
      const hgt = Math.max(minH, levels[i] * height * (style === 'mirror' ? 1 : 0.98));
      const x = i * slot + (slot - bw) / 2;
      const y = style === 'mirror' ? (height - hgt) / 2 : height - hgt;
      body += `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(hgt)}"${r ? ` rx="${f(Math.min(r, hgt / 2))}"` : ''}/>`;
    }
    body = `<g fill="${colour}">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`;
}
const waveGen = {
  id: 'waveform-image', name: 'Waveform generator', group: 'media', icon: 'audio-waveform',
  desc: 'Turn a sound file into a waveform picture (PNG or SVG) for covers, posts and websites.',
  keywords: 'waveform image picture png svg soundwave bars podcast cover visualise',
  accepts: AUDIO,
  render(root, incoming) {
    let buf = null, file = null, svg = '';
    const status = note();
    const dz = dropzone({ accept: ACCEPT_AUDIO, label: 'Drop an audio file here, or tap to choose one', onfiles: f => open(f[0]) });
    const style = tabs([['bars', 'Bars'], ['mirror', 'Mirror'], ['line', 'Line']], 'mirror', draw);
    const bars = input({ type: 'number', value: 80, min: 8, max: 600, step: 1 });
    const gap = input({ type: 'range', value: 35, min: 0, max: 80, step: 1 });
    const w = input({ type: 'number', value: 1200, min: 50, max: 8000, step: 10 });
    const hh = input({ type: 'number', value: 300, min: 20, max: 4000, step: 10 });
    const colour = h('input', { type: 'color', class: 'input au-colour', value: '#4f7fd0' });
    const bgOn = checkbox('Background', false);
    const bg = h('input', { type: 'color', class: 'input au-colour', value: '#ffffff' });
    const roundC = checkbox('Rounded bars', true);
    const loud = checkbox('Fill the height (scale to the loudest bar)', true);
    const prev = h('div', { class: 'preview au-wavegen' });
    const opts = card(h('span', { class: 'field-label' }, 'Style'), style,
      row(field('Bars', bars), field('Width (px)', w), field('Height (px)', hh)),
      row(field('Gap between bars', gap), field('Colour', colour), field('Background colour', bg)),
      h('div', { class: 'checks' }, roundC, bgOn, loud));
    const res = card(prev, row(
      downloadBtn(() => rename(file.name, 'png', '-waveform'), png, 'Download PNG'),
      downloadBtn(() => rename(file.name, 'svg', '-waveform'), () => new Blob([svg], { type: 'image/svg+xml' }), 'Download SVG'),
      sendBtn(async () => svg && { files: [await asFile(await png(), rename(file.name, 'png', '-waveform'))] })));
    opts.hidden = res.hidden = true;
    root.append(card(dz, status.el), opts, res);
    for (const el of [bars, gap, w, hh, colour, bg, bgOn.input, roundC.input, loud.input]) el.addEventListener('input', draw), el.addEventListener('change', draw);

    function draw() {
      if (!buf) return;
      const n = Math.max(8, Math.min(600, +bars.value || 80));
      let lv = rmsSlices(buf, n).map(v => Math.min(1, v * Math.SQRT2));
      if (loud.input.checked) { const m = Math.max(...lv) || 1; lv = lv.map(v => v / m); }
      svg = waveSvg(lv, { style: style.value, width: Math.max(50, +w.value || 1200), height: Math.max(20, +hh.value || 300), gap: +gap.value,
        round: roundC.input.checked, colour: colour.value, bg: bgOn.input.checked ? bg.value : '' });
      prev.innerHTML = svg;
    }
    async function png() {
      if (!svg) return null;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const c = h('canvas', { width: +w.value, height: +hh.value });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(r => c.toBlob(r, 'image/png'));
    }
    async function open(f) {
      file = f; status.clear();
      try { ({ buf } = await loadAudio(f)); } catch (e) { status.error(e.message); return; }
      opts.hidden = res.hidden = false;
      draw();
    }
    if (incoming?.files?.[0]) open(incoming.files[0]);
  },
};

// --- 6. Subtitle converter -----------------------------------------------------------
const SUB_SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Selamat datang ke bengkel.

2
00:00:03,200 --> 00:00:06,000
Today we fix the old radio.
`;
const FPS = [['', 'No change'], ['23.976', '23.976'], ['24', '24'], ['25', '25'], ['29.97', '29.97'], ['30', '30']];
const fpsVal = v => ({ '23.976': 24000 / 1001, '29.97': 30000 / 1001 }[v] || +v);
const subConvert = {
  id: 'subtitles', name: 'Subtitle converter', group: 'media', icon: 'subtitles',
  desc: 'Convert SRT ⇄ WebVTT, shift every timing, fix frame-rate drift and overlapping lines.',
  keywords: 'subtitles srt vtt webvtt captions convert shift sync delay offset frame rate overlap',
  accepts: ['.srt', '.vtt', '.txt', 'text'],
  render(root, incoming) {
    let name = 'subtitles';
    const src = textarea({ rows: 8, value: SUB_SAMPLE });
    const dz = dropzone({ accept: '.srt,.vtt,.txt,text/vtt', label: 'Drop an .srt or .vtt file, or paste below', onfiles: async f => { name = f[0].name.replace(/\.[^.]+$/, ''); src.value = await f[0].text(); src.dispatchEvent(new Event('input', { bubbles: true })); } });
    const to = tabs([['vtt', 'To WebVTT'], ['srt', 'To SRT']], 'vtt', run);
    const shift = input({ type: 'number', value: 0, step: 100 });
    const from = select(FPS, ''), toFps = select(FPS, '');
    const fix = checkbox('Fix overlapping lines', false);
    const gapI = input({ type: 'number', value: 40, min: 0, step: 10 });
    const out = output('Result', { multiline: true, rows: 10 });
    const msg = note(), say = h('p', { class: 'field-hint' });
    const table = h('table', { class: 'table au-cues' });
    const ext = () => to.value;
    root.append(card(dz, field('Subtitles', src)),
      card(h('span', { class: 'field-label' }, 'Convert'), to,
        row(field('Shift all lines (ms)', shift, 'Positive = later, negative = earlier. 1500 = 1.5 s.'), field('Gap kept when fixing (ms)', gapI)),
        row(field('Made for (fps)', from), field('Playing at (fps)', toFps)),
        h('span', { class: 'field-hint' }, 'Use the frame rates when lines drift further out of sync as the video goes on — e.g. 23.976 → 25 for a PAL copy.'),
        fix),
      card(msg.el, say, out.el, row(
        downloadBtn(() => `${name}.${ext()}`, () => new Blob([out.get()], { type: ext() === 'vtt' ? 'text/vtt' : 'application/x-subrip' })),
        sendBtn(() => out.get() && { files: [new File([out.get()], `${name}.${ext()}`, { type: ext() === 'vtt' ? 'text/vtt' : 'text/plain' })] }))),
      card(h('h3', {}, 'Preview'), table));
    function run() {
      const { cues, format } = parseSubs(src.value);
      if (!cues.length) { msg.error(src.value.trim() ? 'No subtitle lines found — each needs a “00:00:01,000 --> 00:00:02,000” line.' : ''); out.set(''); table.replaceChildren(); say.textContent = ''; return; }
      msg.clear();
      const r = adjustSubs(cues, { shift: +shift.value || 0, from: fpsVal(from.value), to: fpsVal(toFps.value), fixOverlaps: fix.input.checked, gap: +gapI.value || 0 });
      out.set(to.value === 'vtt' ? toVtt(r.cues) : toSrt(r.cues));
      const left = countOverlaps(r.cues);
      say.textContent = [`${r.cues.length} lines, read as ${format.toUpperCase()}`,
        r.fixed && `${r.fixed} overlap${r.fixed === 1 ? '' : 's'} fixed`, !fix.input.checked && left && (left === 1 ? '1 line overlaps the next one' : `${left} lines overlap the next one`),
        r.dropped && `${r.dropped} lines moved before 0:00 and were dropped`].filter(Boolean).join(' · ');
      table.replaceChildren(h('tr', {}, h('th', {}, '#'), h('th', {}, 'Start'), h('th', {}, 'End'), h('th', {}, 'Text')),
        ...r.cues.slice(0, 200).map((c, i) => h('tr', {}, h('td', {}, i + 1), h('td', {}, fmtSubTime(c.start)), h('td', {}, fmtSubTime(c.end)), h('td', { class: 'au-cue-text' }, c.text))));
    }
    on([src, shift, from, toFps, fix.input, gapI], run, 'input', 150);
    for (const el of [from, toFps, fix.input]) el.addEventListener('change', run);
    if (incoming) textOf(incoming).then(t => { if (t != null) { if (incoming.files?.[0]) name = incoming.files[0].name.replace(/\.[^.]+$/, ''); src.value = t; run(); } });
  },
};

// --- 7. Timecode calculator ------------------------------------------------------------
const timecode = {
  id: 'timecode', name: 'Timecode calculator', group: 'media', icon: 'timer',
  desc: 'Add and subtract SMPTE timecodes, convert between frames, timecode and seconds — drop-frame aware.',
  keywords: 'timecode smpte frames fps drop frame 29.97 23.976 edit video calculator duration hh:mm:ss:ff',
  render(root) {
    const rateSel = select(RATES.map(r => [r.id, r.label]), '25');
    const a = input({ mono: true, value: '00:00:10:00' }), b = input({ mono: true, value: '00:00:02:12' });
    const op = tabs([['+', 'Add'], ['-', 'Subtract']], '+', calc);
    const res = output('Result');
    const resF = h('p', { class: 'field-hint au-tc-frames' });
    const msg = note();
    const tc = input({ mono: true, value: '01:00:00:00' }), frames = input({ mono: true, value: '' }), seconds = input({ mono: true, value: '' });
    const conv = note();
    root.append(card(field('Frame rate', rateSel, 'Drop-frame skips frame numbers ;00 and ;01 each minute (except every 10th) so the clock keeps to real time.')),
      card(h('h3', {}, 'Add or subtract'), row(field('Timecode A', a), field('Timecode B (or a number of frames)', b)), op, res.el, resF, msg.el),
      card(h('h3', {}, 'Convert'), row(field('Timecode', tc), field('Frames', frames), field('Seconds', seconds)), conv.el));
    const r = () => rateOf(rateSel.value);
    const parse = (s, rr) => (/^-?\d+$/.test(s.trim()) ? +s.trim() : tcToFrames(s, rr));
    function calc() {
      const rr = r(), fa = parse(a.value, rr), fb = parse(b.value, rr);
      if (!isFinite(fa) || !isFinite(fb)) { msg.error(`Use HH:MM:SS${rr.df ? ';' : ':'}FF with frames below ${rr.nominal}${rr.df ? ' (drop-frame skips ;00 and ;01 at most minute starts)' : ''}.`); res.set(''); resF.textContent = ''; return; }
      msg.clear();
      const f = op.value === '+' ? fa + fb : fa - fb;
      res.set(framesToTc(f, rr));
      resF.textContent = `${f.toLocaleString()} frames · ${(f / rr.fps).toFixed(3)} s of real time`;
    }
    let lock = false;
    function fromTc() {
      if (lock) return; const rr = r(), f = tcToFrames(tc.value, rr);
      if (!isFinite(f)) { conv.error('Not a valid timecode at this frame rate.'); return; }
      conv.clear(); lock = true; frames.value = String(f); seconds.value = (f / rr.fps).toFixed(3); lock = false;
    }
    function fromFrames() {
      if (lock) return; const rr = r(), f = Math.round(+frames.value);
      if (!/^-?\d+$/.test(frames.value.trim())) { conv.error('Frames must be a whole number.'); return; }
      conv.clear(); lock = true; tc.value = framesToTc(f, rr); seconds.value = (f / rr.fps).toFixed(3); lock = false;
    }
    function fromSeconds() {
      if (lock) return; const rr = r(), s = +seconds.value;
      if (!isFinite(s) || seconds.value.trim() === '') { conv.error('Seconds must be a number.'); return; }
      conv.clear(); lock = true; const f = Math.round(s * rr.fps); frames.value = String(f); tc.value = framesToTc(f, rr); lock = false;
    }
    on([a, b], calc);
    tc.addEventListener('input', fromTc); frames.addEventListener('input', fromFrames); seconds.addEventListener('input', fromSeconds);
    rateSel.addEventListener('change', () => { calc(); fromTc(); });
    fromTc();
  },
};

// --- 8. Auto subtitle (Whisper) ----------------------------------------------------------
const LANGS = [['', 'Detect automatically'], ['english', 'English'], ['malay', 'Malay'], ['indonesian', 'Indonesian'], ['chinese', 'Chinese'], ['tamil', 'Tamil'],
  ['arabic', 'Arabic'], ['hindi', 'Hindi'], ['japanese', 'Japanese'], ['korean', 'Korean'], ['thai', 'Thai'], ['vietnamese', 'Vietnamese'], ['tagalog', 'Tagalog'],
  ['spanish', 'Spanish'], ['french', 'French'], ['german', 'German'], ['portuguese', 'Portuguese'], ['italian', 'Italian'], ['russian', 'Russian'], ['turkish', 'Turkish'], ['dutch', 'Dutch']];
const MODELS = {
  tiny: { repo: 'onnx-community/whisper-tiny', mb: 85, label: 'Whisper tiny' },
  base: { repo: 'onnx-community/whisper-base', mb: 160, label: 'Whisper base' },
};
const pipes = {};
async function whisper(model, onProgress) {
  if (!pipes[model]) {
    pipes[model] = (async () => {
      const tf = await transformers();
      return tf.pipeline('automatic-speech-recognition', MODELS[model].repo, {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, device: 'wasm', progress_callback: onProgress,
      });
    })();
    pipes[model].catch(() => { delete pipes[model]; });
  }
  return pipes[model];
}

// Splits 16 kHz audio into pieces of at most 30 s, cutting at the quietest moment near the end.
export function speechChunks(x, rate = 16000, max = 30) {
  const out = [], win = Math.round(rate * 0.05);
  for (let s = 0; s < x.length;) {
    let e = Math.min(x.length, s + max * rate);
    if (e < x.length) {
      let best = e, low = Infinity;
      for (let p = e - 8 * rate; p + win <= e; p += win) {
        let sum = 0; for (let i = p; i < p + win; i++) sum += x[i] * x[i];
        if (sum < low) { low = sum; best = p + (win >> 1); }
      }
      e = best;
    }
    out.push([s, e]);
    s = e;
  }
  return out;
}

const autoSub = {
  id: 'auto-subtitle', name: 'Auto subtitle', group: 'media', icon: 'captions',
  desc: 'Turn speech in an audio or video file into SRT/VTT subtitles with Whisper, on this device.',
  keywords: 'transcribe transcription speech to text whisper subtitles captions srt vtt auto generate malay english ai',
  accepts: [...AUDIO, ...VIDEO],
  render(root, incoming) {
    let pcm = null, file = null, cues = [], busy = false;
    const status = note();
    const dz = dropzone({ accept: [ACCEPT_AUDIO, ...VIDEO].join(','), label: 'Drop an audio or video file here, or tap to choose one', onfiles: f => open(f[0]) });
    const info = h('p', { class: 'field-hint' });
    const model = tabs([['tiny', 'Tiny — fast'], ['base', 'Base — better']], 'tiny');
    const lang = select(LANGS, '');
    const translate = checkbox('Translate into English', false);
    const go = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Make subtitles');
    const prog = progress();
    const fmt = tabs([['srt', 'SRT'], ['vtt', 'WebVTT']], 'srt', show);
    const out = output('Subtitles', { multiline: true, rows: 12 });
    const base = () => (file ? file.name.replace(/\.[^.]+$/, '') : 'subtitles');
    const res = card(fmt, out.el, row(
      downloadBtn(() => `${base()}.${fmt.value}`, () => new Blob([out.get()], { type: fmt.value === 'vtt' ? 'text/vtt' : 'application/x-subrip' })),
      sendBtn(() => out.get() && { files: [new File([out.get()], `${base()}.${fmt.value}`, { type: fmt.value === 'vtt' ? 'text/vtt' : 'text/plain' })] })));
    res.hidden = true;
    root.append(card(dz, info, status.el),
      card(h('span', { class: 'field-label' }, 'Model'), model,
        h('span', { class: 'field-hint' }, 'Tiny downloads about 85 MB, base about 160 MB — once, then they work offline. Base makes fewer mistakes but is 2–3× slower.'),
        row(field('Language spoken', lang, 'Pick the language actually spoken — the wrong one gives nonsense. Malay works, but less well than English.')), translate, row(go), prog.el),
      res);
    function show() { out.set(fmt.value === 'vtt' ? toVtt(cues) : toSrt(cues)); }
    async function open(f) {
      file = f; status.clear(); res.hidden = true;
      info.textContent = 'Reading the sound…';
      try {
        const { buf } = await loadAudio(f);
        pcm = await toMonoRate(buf, 16000);
        info.textContent = `${f.name} — ${fmtTime(buf.duration)} of sound ready.`;
        go.disabled = false;
      } catch (e) { info.textContent = ''; status.error(e.message + '. For video files, the browser must be able to read the sound track (MP4/MOV with AAC usually works).'); }
    }
    go.onclick = async () => {
      if (!pcm || busy) return;
      busy = true; go.disabled = true; status.clear();
      const m = model.value;
      try {
        await askToFetch(root, { id: 'whisper-' + m, what: MODELS[m].label, mb: MODELS[m].mb,
          why: `Auto subtitle needs the ${MODELS[m].label} speech model (MIT licence) and the AI runtime. They are downloaded once, kept on this device, and then work offline. Your recording never leaves the device.` });
        prog.set(0); prog.label('Loading the speech model…');
        const files = {};
        const asr = await whisper(m, p => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = [p.loaded, p.total];
            const [l, t] = Object.values(files).reduce((s, [a, b]) => [s[0] + a, s[1] + b], [0, 0]);
            prog.set(l / t * 0.5); prog.label(`Downloading the model… ${fmtBytes(l)} of ${fmtBytes(t)}`);
          }
        });
        markFetched('whisper-' + m);
        const parts = speechChunks(pcm);
        cues = [];
        for (const [i, [s, e]] of parts.entries()) {
          prog.set(0.5 + 0.5 * i / parts.length); prog.label(`Listening… part ${i + 1} of ${parts.length}`);
          await new Promise(r => setTimeout(r, 30));
          const opt = { return_timestamps: true, task: translate.input.checked ? 'translate' : 'transcribe' };
          if (lang.value) opt.language = lang.value;
          const r = await asr(pcm.subarray(s, e), opt);
          const off = s / 16000, partEnd = e / 16000;
          for (const c of r.chunks || [{ timestamp: [0, partEnd - off], text: r.text }]) {
            // Whisper sometimes loops on one word when unsure; squash the repeats.
            const text = (c.text || '').replace(/(.{2,40}?)\1{3,}/g, '$1…').trim();
            if (!text) continue;
            const a = off + (c.timestamp?.[0] ?? 0), b = Math.min(partEnd, off + (c.timestamp?.[1] ?? partEnd - off));
            cues.push({ start: Math.round(a * 1000), end: Math.round(Math.max(a + 0.3, b) * 1000), text });
          }
        }
        prog.set(1); prog.label(`Done — ${cues.length} lines.`);
        if (!cues.length) status.info('No speech was found.');
        show(); res.hidden = !cues.length;
      } catch (e) {
        prog.hide();
        status.error('Transcription failed: ' + (e.message || e) + (navigator.onLine ? '' : ' — the model is not downloaded yet and you are offline.'));
      } finally { busy = false; go.disabled = false; }
    };
    if (incoming?.files?.[0]) open(incoming.files[0]);
  },
};

export default [atlas, trimmer, normaliser, recorder, waveGen, subConvert, timecode, autoSub];
