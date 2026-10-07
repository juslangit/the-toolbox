// Video half of the "Audio & video" drawer. The engine (mediabunny on WebCodecs,
// with ffmpeg.wasm as a big optional fallback) lives in js/lib/video-*.js and is
// loaded only when a video tool opens.
import { h, card, field, input, select, checkbox, row, tabs, note, progress, fmtBytes, toast } from '../ui.js';
import { sendBtn, sendTo, receivers } from '../hub.js';
import {
  VIDEO_ACCEPT, VIDEO_INPUT, fmtTime, codecName, probe, muteVideo, extractAudio, trimVideo, keyFrameBefore,
  framesAt, durationOf, processVideo, openVideo, NeedsBigEngine, hasWebCodecs, hasVideoEncoder, hasAudioDecoder,
} from '../lib/video-core.js';
import { videoSlot, player, resultBox, timeline, secondsInput } from '../lib/video-ui.js';
import { makeGif, makeWebp, canWebp, clipRange, gifInfo } from '../lib/video-gif.js';
import { parseSubs, drawSubs, DEFAULT_STYLE } from '../lib/video-subs.js';
import { canPickScreen, recordFormats, mixAudio, recordStream, tidyRecording } from '../lib/video-rec.js';

const G = 'media';
const base = n => n.replace(/\.[^.]+$/, '');

// Runs a job with a progress bar and a busy button.
async function busy(btn, bar, label, job) {
  btn.disabled = true;
  bar.set(0); bar.label(label);
  try { return await job(p => bar.set(p)); }
  finally { btn.disabled = false; bar.hide(); }
}

const kv = pairs => h('dl', { class: 'kv wide' }, pairs.filter(p => p && p[1] != null && p[1] !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
const fmtRate = bps => bps ? (bps >= 1e6 ? (bps / 1e6).toFixed(2) + ' Mb/s' : Math.round(bps / 1e3) + ' kb/s') : null;
const fmtFps = f => f ? (Math.abs(f - Math.round(f)) < 0.02 ? Math.round(f) : f.toFixed(2)) + ' fps' : null;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const ratio = (w, hh) => { const g = gcd(w, hh) || 1; const r = `${w / g}:${hh / g}`; return r.length > 7 ? (w / hh).toFixed(2) + ':1' : r; };

// ---------------------------------------------------------------- Video Atlas
const atlas = {
  id: 'video-atlas', name: 'Video Atlas', group: G, icon: 'file-video', atlas: true,
  desc: 'Everything about one video: length, size, codecs, frame rate, sound, a strip of frames — then send it on.',
  keywords: 'video info inspect metadata codec resolution fps bitrate duration mediainfo probe details',
  accepts: VIDEO_ACCEPT,
  render(root, incoming) {
    const vid = player();
    const info = h('div', { class: 'vid-info' });
    const strip = h('div', { class: 'vid-strip' });
    const actions = h('div', { class: 'chips vid-actions' });
    const out = h('div', { class: 'stack', hidden: true },
      card(vid, info), card(h('h3', {}, 'Frames'), strip), card(h('h3', {}, 'Do something with it'), actions));
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el), out);

    async function load(file) {
      out.hidden = true;
      const i = await probe(file);
      out.hidden = false;
      vid.setFile(file);
      const sound = i.acodec ? `${codecName(i.acodec)} · ${i.channels === 1 ? 'mono' : i.channels === 2 ? 'stereo' : i.channels + ' channels'} · ${(i.sampleRate / 1000).toFixed(1)} kHz${i.abitrate ? ' · ' + fmtRate(i.abitrate) : ''}${i.language ? ' · ' + i.language : ''}` : 'No sound track';
      info.replaceChildren(h('div', { class: 'stat-grid' },
        stat(fmtTime(i.duration), 'Length'),
        stat(i.width ? `${i.width}×${i.height}` : '—', 'Picture size'),
        stat(fmtFps(i.fps) || '—', 'Frame rate'),
        stat(fmtBytes(i.size), 'File size')),
      kv([
        ['Container', `${i.container} (${i.mime})`],
        i.vcodec && ['Video', `${codecName(i.vcodec)}${i.vcodecString ? ' · ' + i.vcodecString : ''}${i.hdr ? ' · HDR' : ''}`],
        ['Sound', sound],
        i.width && ['Aspect ratio', ratio(i.width, i.height)],
        i.codedWidth && (i.codedWidth !== i.width || i.codedHeight !== i.height) && ['Stored size', `${i.codedWidth}×${i.codedHeight}`],
        ['Rotation', i.rotation ? `${i.rotation}° (players turn it upright)` : 'none'],
        ['Overall bitrate', fmtRate(i.bitrate)],
        i.vbitrate && ['Video bitrate', fmtRate(i.vbitrate)],
        i.frames && ['Frames', i.frames.toLocaleString()],
        (i.videoTracks > 1 || i.audioTracks > 1) && ['Tracks', `${i.videoTracks} video, ${i.audioTracks} sound`],
        i.created && ['Recorded', i.created.toLocaleString()],
        i.title && ['Title', i.title],
        i.device && ['Device', [...new Set(i.device)].join(' · ')],
        i.location && ['Location', i.location],
        ['Can decode here', i.canDecode ? 'Yes' : 'No — frame tools will offer the big engine'],
      ]));
      actions.replaceChildren(...receivers({ files: [file] }, 'video-atlas').map(t =>
        h('button', { class: 'chip', type: 'button', onclick: () => sendTo(t.id, { files: [file] }) }, t.name)));
      strip.replaceChildren(h('p', { class: 'field-hint' }, i.canDecode ? 'Reading frames…' : 'This browser cannot decode this video, so there are no frames to show.'));
      if (i.canDecode && i.duration > 0) {
        const n = 8, times = Array.from({ length: n }, (_, k) => i.duration * (k + 0.5) / n);
        const frames = await framesAt(file, times, { width: 240 });
        if (slot.file !== file) return;
        strip.replaceChildren(...frames.map(f => f.canvas && h('figure', { class: 'vid-frame', onclick: () => { vid.currentTime = f.timestamp; } },
          f.canvas, h('figcaption', {}, fmtTime(f.timestamp, 1)))));
      }
    }
    const stat = (v, l) => h('div', { class: 'stat' }, h('strong', {}, v), h('span', {}, l));
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => vid.dispose();
  },
};

// ---------------------------------------------------------- Audio extractor
const audioOut = {
  id: 'video-extract-audio', name: 'Audio extractor', group: G, icon: 'file-audio',
  desc: 'Pull the sound out of a video — kept exactly as it is, or as a WAV.',
  keywords: 'extract audio sound from video rip mp3 m4a aac wav soundtrack separate',
  accepts: VIDEO_ACCEPT,
  steps: [{
    id: 'video-audio', name: 'Pull out the audio', accepts: VIDEO_ACCEPT,
    options: [{ key: 'format', label: 'Format', type: 'select', value: 'original', choices: [['original', 'Keep as it is (no quality loss)'], ['wav', 'WAV']] }],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) out.push(await extractAudio(f, opts.format, p => ctx.progress((i + p) / files.length, f.name)));
      return out;
    },
  }],
  render(root, incoming) {
    const what = h('div');
    const fmt = tabs([['original', 'Keep as it is'], ['wav', 'WAV']], 'original', () => hint());
    const hintEl = h('p', { class: 'field-hint' });
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Pull out the audio');
    const bar = progress();
    const res = resultBox();
    const opts = h('div', { class: 'stack', hidden: true }, what, field('Format', fmt), hintEl, row(go), bar.el);
    let codec = null;
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el, opts), res.el);
    const home = c => ({ aac: '.m4a', mp3: '.mp3', opus: '.ogg', vorbis: '.ogg', flac: '.flac' }[c] || (c?.startsWith('pcm') ? '.wav' : '.mka'));
    function hint() {
      hintEl.textContent = fmt.value === 'original'
        ? `The ${codecName(codec)} sound is copied straight out into a ${home(codec)} file — fast, and no quality is lost.`
        : `Decoded to uncompressed 16-bit WAV — big, but every editor opens it.${hasAudioDecoder() ? '' : ' (This browser decodes it with Web Audio.)'}`;
    }
    async function load(file) {
      res.hide(); opts.hidden = true;
      const v = await openVideo(file);
      try {
        if (!v.audio) { what.replaceChildren(h('p', { class: 'verdict bad' }, 'This video has no sound track.')); opts.hidden = false; go.disabled = true; return; }
        codec = await v.audio.getCodec();
        const ch = await v.audio.getNumberOfChannels(), sr = await v.audio.getSampleRate();
        what.replaceChildren(h('p', { class: 'big-say' }, `${codecName(codec)} · ${ch === 1 ? 'mono' : ch === 2 ? 'stereo' : ch + ' ch'} · ${(sr / 1000).toFixed(1)} kHz`));
      } finally { v.close(); }
      go.disabled = false; opts.hidden = false; hint();
    }
    go.onclick = async () => {
      try {
        const f = await busy(go, bar, 'Pulling out the audio…', p => extractAudio(slot.file, fmt.value, p));
        res.show(f, { line: fmt.value === 'original' ? 'copied, no re-encode' : 'WAV 16-bit' });
      } catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => res.dispose();
  },
};

// --------------------------------------------------------------- Video muter
const muter = {
  id: 'video-mute', name: 'Video muter', group: G, icon: 'volume-x',
  desc: 'Remove the sound from a video without touching the picture.',
  keywords: 'mute remove audio sound silent strip track video no sound',
  accepts: VIDEO_ACCEPT,
  steps: [{
    id: 'video-mute', name: 'Remove the sound', accepts: VIDEO_ACCEPT, options: [],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) out.push(await muteVideo(f, p => ctx.progress((i + p) / files.length, f.name)));
      return out;
    },
  }],
  render(root, incoming) {
    const say = h('div');
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Remove the sound');
    const bar = progress();
    const res = resultBox();
    const opts = h('div', { class: 'stack', hidden: true }, say,
      h('p', { class: 'field-hint' }, 'The picture is copied as it is — no re-encoding, so no quality is lost and it is quick.'), row(go), bar.el);
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el, opts), res.el);
    async function load(file) {
      res.hide();
      const v = await openVideo(file);
      try {
        if (!v.video) throw new Error('This file has no picture — it is sound only.');
        const n = (await v.input.getAudioTracks()).length;
        say.replaceChildren(h('p', { class: 'big-say' }, n ? `${n} sound track${n > 1 ? 's' : ''} to remove (${codecName(await v.audio.getCodec())})` : 'This video is already silent.'));
      } finally { v.close(); }
      opts.hidden = false;
    }
    go.onclick = async () => {
      try { res.show(await busy(go, bar, 'Removing the sound…', p => muteVideo(slot.file, p)), { line: 'no sound track' }); }
      catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => res.dispose();
  },
};

// ------------------------------------------------------------- Video trimmer
const trimmer = {
  id: 'video-trim', name: 'Video trimmer', group: G, icon: 'scissors',
  desc: 'Cut a video to the part you want — quick with no re-encode, or frame-exact.',
  keywords: 'trim cut clip shorten split video start end in out',
  accepts: VIDEO_ACCEPT,
  render(root, incoming) {
    const vid = player();
    let dur = 0, kfTimer = 0, rafId = 0;
    const tl = timeline({ duration: 1, onchange: (a, b) => { syncInputs(a, b); keyNote(); }, onseek: t => { vid.currentTime = t; } });
    const sIn = secondsInput(0), eIn = secondsInput(0);
    const setStart = h('button', { class: 'btn', type: 'button' }, 'Start here');
    const setEnd = h('button', { class: 'btn', type: 'button' }, 'End here');
    const playSel = h('button', { class: 'btn ghost', type: 'button' }, 'Play the part');
    const mode = tabs([['quick', 'Quick (no re-encode)'], ['exact', 'Exact (re-encode)']], 'quick', () => keyNote());
    const kf = h('p', { class: 'field-hint' });
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Cut');
    const bar = progress();
    const res = resultBox();
    const editor = h('div', { class: 'stack', hidden: true }, vid, tl.el,
      h('div', { class: 'row vid-setters' }, setStart, setEnd, playSel),
      h('div', { class: 'grid2' }, field('Start (seconds)', sIn), field('End (seconds)', eIn)),
      field('How to cut', mode), kf, row(go), bar.el);
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el, editor), res.el);
    if (!hasVideoEncoder()) mode.querySelector('[data-v=exact]').disabled = true;

    function syncInputs(a, b) { sIn.value = a.toFixed(2); eIn.value = b.toFixed(2); }
    async function load(file) {
      res.hide(); editor.hidden = true;
      dur = await durationOf(file);
      vid.setFile(file);
      tl.set(0, dur, dur); syncInputs(0, dur);
      sIn.max = eIn.max = dur.toFixed(2);
      editor.hidden = false;
      keyNote();
      const v = await openVideo(file).catch(() => null);
      const ok = v && v.video && hasWebCodecs() && await v.video.canDecode();
      v?.close();
      if (ok) {
        const times = Array.from({ length: 10 }, (_, k) => dur * (k + 0.5) / 10);
        framesAt(file, times, { width: 120 }).then(fr => { if (slot.file === file) tl.setThumbs(fr.map(f => f.canvas)); }).catch(() => {});
      }
    }
    const fromInputs = () => {
      const a = Math.max(0, +sIn.value || 0), b = Math.min(dur, +eIn.value || dur);
      if (b > a) { tl.set(a, b); keyNote(); }
    };
    sIn.addEventListener('change', fromInputs); eIn.addEventListener('change', fromInputs);
    setStart.onclick = () => { tl.set(Math.min(vid.currentTime, tl.end - 0.05), tl.end); syncInputs(tl.start, tl.end); keyNote(); };
    setEnd.onclick = () => { tl.set(tl.start, Math.max(vid.currentTime, tl.start + 0.05)); syncInputs(tl.start, tl.end); keyNote(); };
    playSel.onclick = () => { vid.currentTime = tl.start; vid.play(); };
    const tick = () => {
      tl.setHead(vid.currentTime);
      if (!vid.paused && vid.currentTime >= tl.end && playing) { vid.pause(); playing = false; }
      rafId = requestAnimationFrame(tick);
    };
    let playing = false;
    playSel.addEventListener('click', () => { playing = true; });
    rafId = requestAnimationFrame(tick);

    function keyNote() {
      clearTimeout(kfTimer);
      if (mode.value === 'exact') { kf.textContent = 'The picture is re-encoded so the cut lands exactly on your start. Slower, and very slightly lower quality.'; return; }
      kf.textContent = 'Finding the nearest key frame…';
      kfTimer = setTimeout(async () => {
        if (!slot.file) return;
        const k = await keyFrameBefore(slot.file, tl.start).catch(() => tl.start);
        const off = tl.start - k;
        kf.textContent = off > 0.04
          ? `No re-encode, so the cut has to begin on a key frame: it will start at ${fmtTime(k)}, ${off.toFixed(2)} s before your start. Choose Exact for a cut right on the frame.`
          : 'Your start sits on a key frame, so the quick cut will be exact.';
      }, 250);
    }
    go.onclick = async () => {
      try {
        const exact = mode.value === 'exact';
        const f = await busy(go, bar, exact ? 'Re-encoding the part…' : 'Copying the part…', p => trimVideo(slot.file, { start: tl.start, end: tl.end, exact }, p));
        const d = await durationOf(f).catch(() => null);
        res.show(f, { line: `${d ? fmtTime(d) + ' long' : ''}${exact ? ' · re-encoded' : ' · no re-encode'}` });
      } catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => { cancelAnimationFrame(rafId); clearTimeout(kfTimer); vid.dispose(); res.dispose(); };
  },
};

// -------------------------------------------------------------- Video to GIF
const gifTool = {
  id: 'video-gif', name: 'Video to GIF', group: G, icon: 'images',
  desc: 'Turn part of a video into a looping GIF (or animated WebP) for chat and docs.',
  keywords: 'gif animated webp animation loop meme clip convert video to gif',
  accepts: VIDEO_ACCEPT,
  steps: [{
    id: 'video-gif', name: 'Make a GIF', accepts: VIDEO_ACCEPT,
    options: [
      { key: 'fps', label: 'Frames per second', type: 'number', value: 12, min: 1, max: 30, step: 1 },
      { key: 'width', label: 'Width (px)', type: 'number', value: 480, min: 32, max: 1920, step: 2 },
      { key: 'start', label: 'Start (s)', type: 'number', value: 0, min: 0, step: 0.1 },
      { key: 'duration', label: 'Length (s, 0 = whole clip up to 15 s)', type: 'number', value: 0, min: 0, max: 60, step: 0.1 },
    ],
    async run(files, opts, ctx) {
      const out = [];
      for (const [i, f] of files.entries()) {
        const r = await makeGif(f, { fps: +opts.fps || 12, width: +opts.width || 480, start: +opts.start || 0, duration: +opts.duration || 0 },
          p => ctx.progress((i + p) / files.length, f.name));
        out.push(new File([r.blob], base(f.name) + '.gif', { type: 'image/gif' }));
      }
      return out;
    },
  }],
  render(root, incoming) {
    const vid = player();
    let dur = 0, estTimer = 0, estRun = 0;
    const sIn = secondsInput(0), dIn = secondsInput(0, { step: 0.1 });
    const fromNow = h('button', { class: 'btn small', type: 'button' }, 'Start here');
    const fps = select([5, 8, 10, 12, 15, 20, 24, 30].map(n => [String(n), n + ' fps']), '12');
    const width = input({ type: 'number', value: 480, min: 32, max: 1920, step: 2 });
    const loop = checkbox('Loop forever', true);
    const kind = tabs([['gif', 'GIF'], ['webp', 'Animated WebP']], 'gif', () => estimate());
    const est = h('p', { class: 'big-say vid-est' });
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Make it');
    const bar = progress();
    const res = resultBox();
    const editor = h('div', { class: 'stack', hidden: true }, vid,
      h('div', { class: 'grid2' }, field('Start (seconds)', sIn), field('Length (seconds)', dIn, '0 = whole clip, up to 15 s')),
      row(fromNow),
      h('div', { class: 'grid2' }, field('Smoothness', fps), field('Width (px)', width)),
      loop, field('Format', kind), est, row(go), bar.el);
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el, editor), res.el);
    canWebp().then(ok => { if (!ok) { kind.querySelector('[data-v=webp]').hidden = true; } });

    const opts = () => ({ fps: +fps.value, width: Math.max(32, +width.value || 480), start: +sIn.value || 0, duration: +dIn.value || 0, loop: loop.input.checked });
    async function load(file) {
      res.hide(); editor.hidden = true;
      const v = await openVideo(file);
      try {
        if (!v.video) throw new Error('This file has no picture.');
        if (!hasWebCodecs() || !(await v.video.canDecode())) throw new NeedsBigEngine('This browser cannot decode this video.');
        dur = await v.input.computeDuration();
        const vw = await v.video.getDisplayWidth();
        if (vw < 480) width.value = vw & ~1;
      } finally { v.close(); }
      vid.setFile(file);
      editor.hidden = false;
      estimate();
    }
    // Size estimate: encode three frames, scale up by the frame count.
    function estimate() {
      clearTimeout(estTimer);
      if (!slot.file) return;
      const o = opts(), r = clipRange(dur, o.start, o.duration), n = Math.max(1, Math.round(r.duration * o.fps));
      est.textContent = `${n} frames · ${fmtTime(r.duration, 1)} · working out the size…`;
      const run = ++estRun;
      estTimer = setTimeout(async () => {
        try {
          const sample = Math.min(n, 3);
          const make = kind.value === 'webp' ? makeWebp : makeGif;
          const t = await make(slot.file, { ...o, start: r.start + r.duration / 2, duration: sample / o.fps });
          if (run !== estRun) return;
          const bytes = t.blob.size / t.frames * n;
          est.textContent = `${n} frames · ${t.width}×${t.height} · about ${fmtBytes(bytes)}`;
          if (bytes > 15e6) est.textContent += ' — big for chat; try fewer fps or a smaller width';
        } catch (e) { if (run === estRun) est.textContent = `${n} frames`; }
      }, 500);
    }
    for (const el of [sIn, dIn, fps, width]) el.addEventListener('change', estimate);
    fromNow.onclick = () => { sIn.value = vid.currentTime.toFixed(2); estimate(); };
    go.onclick = async () => {
      try {
        const webp = kind.value === 'webp';
        const r = await busy(go, bar, 'Making frames…', p => (webp ? makeWebp : makeGif)(slot.file, opts(), p));
        const f = new File([r.blob], base(slot.file.name) + (webp ? '.webp' : '.gif'), { type: r.blob.type });
        res.show(f, { kind: 'image', line: `${r.frames} frames · ${r.width}×${r.height}` });
      } catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => { clearTimeout(estTimer); vid.dispose(); res.dispose(); };
  },
};

// ----------------------------------------------------------- Frame extractor
const frames = {
  id: 'video-frames', name: 'Frame extractor', group: G, icon: 'camera',
  desc: 'Save a still from a video, a frame every few seconds, or a contact sheet.',
  keywords: 'frame still screenshot snapshot thumbnail extract image png contact sheet grid storyboard',
  accepts: VIDEO_ACCEPT,
  render(root, incoming) {
    const vid = player();
    let dur = 0, vw = 0;
    const mode = tabs([['now', 'This moment'], ['every', 'Every few seconds'], ['sheet', 'Contact sheet']], 'now', v => {
      paneNow.hidden = v !== 'now'; paneEvery.hidden = v !== 'every'; paneSheet.hidden = v !== 'sheet'; countEvery();
    });
    const grab = h('button', { class: 'btn primary', type: 'button' }, 'Save this frame');
    const nowAt = h('p', { class: 'field-hint' });
    const paneNow = h('div', { class: 'stack' }, nowAt, row(grab));
    const every = secondsInput(1, { min: 0.1, step: 0.1 });
    const efmt = select([['image/png', 'PNG'], ['image/jpeg', 'JPEG']], 'image/png');
    const ewidth = select([['0', 'Full size'], ['1280', '1280 px wide'], ['640', '640 px wide'], ['320', '320 px wide']], '0');
    const ecount = h('p', { class: 'field-hint' });
    const egoBtn = h('button', { class: 'btn primary', type: 'button' }, 'Make the zip');
    const paneEvery = h('div', { class: 'stack', hidden: true }, h('div', { class: 'grid2' }, field('Every (seconds)', every), field('Format', efmt)), field('Size', ewidth), ecount, row(egoBtn));
    const cols = select([2, 3, 4, 5, 6].map(String), '4'), rows = select([2, 3, 4, 5, 6, 8].map(String), '4');
    const stamps = checkbox('Show the time on each frame', true);
    const sgo = h('button', { class: 'btn primary', type: 'button' }, 'Make the sheet');
    const paneSheet = h('div', { class: 'stack', hidden: true }, h('div', { class: 'grid2' }, field('Across', cols), field('Down', rows)), stamps, row(sgo));
    const bar = progress();
    const res = resultBox();
    const editor = h('div', { class: 'stack', hidden: true }, vid, field('What to save', mode), paneNow, paneEvery, paneSheet, bar.el);
    const slot = videoSlot({ onfile: load });
    root.append(card(slot.el, editor), res.el);

    const showAt = () => { nowAt.textContent = `At ${fmtTime(vid.currentTime)} — pause the video on the frame you want. The frame is decoded from the file, so it is exactly that frame at full size.`; };
    vid.addEventListener('timeupdate', showAt); vid.addEventListener('seeked', showAt);
    function countEvery() { const n = Math.floor(dur / Math.max(0.1, +every.value || 1)) + 1; ecount.textContent = `${n} frames`; if (n > 300) ecount.textContent += ' — that is a lot; try a longer gap'; }
    every.addEventListener('input', countEvery);
    async function load(file) {
      res.hide(); editor.hidden = true;
      const v = await openVideo(file);
      try {
        if (!v.video) throw new Error('This file has no picture.');
        if (!hasWebCodecs() || !(await v.video.canDecode())) throw new NeedsBigEngine('This browser cannot decode this video.');
        dur = await v.input.computeDuration(); vw = await v.video.getDisplayWidth();
      } finally { v.close(); }
      vid.setFile(file);
      editor.hidden = false; showAt(); countEvery();
    }
    grab.onclick = async () => {
      try {
        vid.pause();
        const t = vid.currentTime;
        const [f] = await busy(grab, bar, 'Decoding the frame…', () => framesAt(slot.file, [Math.min(t, Math.max(0, dur - 0.001))]));
        if (!f?.canvas) throw new Error('No frame at that time.');
        const blob = await new Promise(r => f.canvas.toBlob(r, 'image/png'));
        const file = new File([blob], `${base(slot.file.name)}-${t.toFixed(2).replace('.', '_')}s.png`, { type: 'image/png' });
        res.show(file, { kind: 'image', line: `${f.canvas.width}×${f.canvas.height} at ${fmtTime(f.timestamp)}` });
      } catch (e) { slot.err.error(e.message); }
    };
    egoBtn.onclick = async () => {
      try {
        const gap = Math.max(0.1, +every.value || 1);
        const times = [];
        for (let t = 0; t < dur - 0.001 && times.length < 1000; t += gap) times.push(+t.toFixed(3));
        const w = +ewidth.value && +ewidth.value < vw ? +ewidth.value : undefined;
        const type = efmt.value, ext = type === 'image/png' ? 'png' : 'jpg';
        const { zipSync } = await import('../../vendor/fflate.js');
        const entries = {};
        await busy(egoBtn, bar, `Saving ${times.length} frames…`, async p => {
          const list = await framesAt(slot.file, times, { width: w, onFrame: (i) => p((i + 1) / times.length * 0.8) });
          for (const [i, f] of list.entries()) {
            if (!f.canvas) continue;
            const b = await new Promise(r => f.canvas.toBlob(r, type, 0.9));
            entries[`${base(slot.file.name)}-${String(i + 1).padStart(4, '0')}-${f.timestamp.toFixed(2)}s.${ext}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
          }
        });
        const zip = new File([zipSync(entries)], `${base(slot.file.name)}-frames.zip`, { type: 'application/zip' });
        res.show(zip, { line: `${Object.keys(entries).length} frames` });
      } catch (e) { slot.err.error(e.message); }
    };
    sgo.onclick = async () => {
      try {
        const C = +cols.value, R = +rows.value, n = C * R;
        const times = Array.from({ length: n }, (_, k) => dur * (k + 0.5) / n);
        const tw = Math.min(360, vw);
        const list = await busy(sgo, bar, 'Reading frames…', p => framesAt(slot.file, times, { width: tw, onFrame: i => p((i + 1) / n) }));
        const first = list.find(f => f.canvas)?.canvas;
        if (!first) throw new Error('Could not read any frames.');
        const fw = first.width, fh = first.height, gap = 8, head = 48;
        const sheet = document.createElement('canvas');
        sheet.width = C * fw + (C + 1) * gap; sheet.height = head + R * fh + (R + 1) * gap;
        const x = sheet.getContext('2d');
        x.fillStyle = '#16120e'; x.fillRect(0, 0, sheet.width, sheet.height);
        x.fillStyle = '#f2e6d4'; x.font = '600 20px system-ui, sans-serif'; x.textBaseline = 'middle';
        x.fillText(`${slot.file.name} · ${fmtTime(dur)} · ${fmtBytes(slot.file.size)}`.slice(0, 90), gap + 4, head / 2 + 4);
        list.forEach((f, k) => {
          const cx = gap + (k % C) * (fw + gap), cy = head + gap + Math.floor(k / C) * (fh + gap);
          if (f.canvas) x.drawImage(f.canvas, cx, cy, fw, fh);
          if (stamps.input.checked) {
            const label = fmtTime(f.timestamp, 1);
            x.font = '600 15px ui-monospace, monospace';
            const lw = x.measureText(label).width + 12;
            x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(cx + fw - lw - 6, cy + fh - 28, lw, 22);
            x.fillStyle = '#fff'; x.fillText(label, cx + fw - lw, cy + fh - 17);
          }
        });
        const blob = await new Promise(r => sheet.toBlob(r, 'image/png'));
        res.show(new File([blob], `${base(slot.file.name)}-contact-sheet.png`, { type: 'image/png' }), { kind: 'image', line: `${C}×${R} frames · ${sheet.width}×${sheet.height}` });
      } catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.[0]) slot.load(incoming.files[0]);
    return () => { vid.dispose(); res.dispose(); };
  },
};

// ----------------------------------------------------------- Screen recorder
const recorder = {
  id: 'screen-rec', name: 'Screen recorder', group: G, icon: 'monitor-up',
  desc: 'Record your screen, a window or a tab — with its sound and your microphone if you like.',
  keywords: 'screen record recorder capture screencast desktop tab window microphone video',
  render(root) {
    const res = resultBox();
    if (!canPickScreen()) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      root.append(card(
        h('p', { class: 'verdict bad' }, 'This browser cannot record the screen.'),
        h('p', {}, ios
          ? 'iPhone and iPad do not let web pages record the screen. Use the built-in recorder instead: open Control Centre and tap the Screen Recording button (add it in Settings → Control Centre if it is missing). Then drop the video into any tool here.'
          : 'Screen recording needs a desktop browser such as Chrome, Edge, Firefox or Safari on a Mac.'),
        h('div', { class: 'row tight' }, h('a', { class: 'btn', href: '#/tool/video-atlas' }, 'Open a recording in Video Atlas'))));
      return;
    }
    const formats = recordFormats();
    const fmt = select(formats.map(([m, l]) => [m, l]), formats[0]?.[0]);
    const sys = checkbox('Record the sound of the tab or screen', true);
    const mic = checkbox('Add my microphone', false);
    const count = select([['0', 'No countdown'], ['3', '3 seconds'], ['5', '5 seconds']], '3');
    const start = h('button', { class: 'btn primary', type: 'button' }, 'Choose what to record');
    const stop = h('button', { class: 'btn', type: 'button', hidden: true }, 'Stop');
    const pause = h('button', { class: 'btn ghost', type: 'button', hidden: true }, 'Pause');
    const clock = h('div', { class: 'vid-clock', hidden: true }, '0:00');
    const err = note();
    const live = h('video', { class: 'vid-player', muted: true, playsInline: true, autoplay: true, hidden: true });
    live.muted = true;
    root.append(card(
      h('div', { class: 'grid2' }, field('Format', fmt), field('Countdown', count)),
      h('div', { class: 'checks' }, sys, mic),
      h('p', { class: 'field-hint' }, 'Sound from a tab works in Chrome and Edge (tick “Share tab audio” in the picker); whole-screen sound only on Windows and ChromeOS. Safari and Firefox record the picture and microphone.'),
      h('div', { class: 'row' }, start, pause, stop, clock), err.el, live), res.el);

    let streams = [], mix = null, rec = null, t0 = 0, paused = 0, pausedAt = 0, timer = 0, cancelled = false;
    const tidy = () => {
      clearInterval(timer);
      streams.forEach(s => s.getTracks().forEach(t => t.stop())); streams = [];
      mix?.close(); mix = null;
      live.srcObject = null; live.hidden = true;
      start.hidden = false; stop.hidden = true; pause.hidden = true; clock.hidden = true;
    };
    start.onclick = async () => {
      err.clear(); res.hide(); cancelled = false;
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: sys.input.checked });
        streams.push(display);
        if (mic.input.checked) {
          try { streams.push(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })); }
          catch { toast('Microphone not allowed — recording without it'); }
        }
        mix = mixAudio(streams);
        const out = new MediaStream([display.getVideoTracks()[0], ...(mix.track ? [mix.track] : [])]);
        display.getVideoTracks()[0].addEventListener('ended', () => stop.click());
        live.srcObject = display; live.hidden = false;
        start.hidden = true; stop.hidden = false; clock.hidden = false;
        for (let n = +count.value; n > 0; n--) {
          clock.textContent = `Starting in ${n}…`;
          await new Promise(r => setTimeout(r, 1000));
          if (cancelled) return;
        }
        rec = recordStream(out, fmt.value);
        t0 = performance.now(); paused = 0;
        pause.hidden = false; pause.textContent = 'Pause';
        clock.classList.add('rec');
        timer = setInterval(() => {
          if (rec?.recorder.state === 'recording') clock.textContent = '● ' + fmtTime((performance.now() - t0 - paused) / 1000, 0);
        }, 250);
      } catch (e) {
        tidy();
        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') err.error('Could not start recording: ' + e.message);
      }
    };
    pause.onclick = () => {
      if (!rec) return;
      if (rec.recorder.state === 'recording') { rec.recorder.pause(); pausedAt = performance.now(); pause.textContent = 'Resume'; clock.textContent = '❚❚ paused'; }
      else { rec.recorder.resume(); paused += performance.now() - pausedAt; pause.textContent = 'Pause'; }
    };
    stop.onclick = async () => {
      cancelled = true;
      clock.classList.remove('rec');
      const r = rec; rec = null;
      tidy();
      if (!r) return;
      const blob = await r.stop();
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const stampName = `screen-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
      const f = await tidyRecording(blob, stampName);
      res.show(f, { kind: 'video', line: fmtTime((blob.size && (performance.now() - t0 - paused) / 1000) || 0, 0) + ' recorded' });
    };
    return () => { cancelled = true; if (rec) rec.stop(); rec = null; tidy(); res.dispose(); };
  },
};

// ---------------------------------------------------------- Subtitle studio
const SUB_ACCEPT = [...VIDEO_ACCEPT, '.srt', '.vtt'];
const studio = {
  id: 'subtitle-burn', name: 'Subtitle studio', group: G, icon: 'subtitles',
  desc: 'Burn SRT or VTT subtitles into a video, styled the way you want.',
  keywords: 'subtitles captions burn hardsub srt vtt overlay text video open captions',
  accepts: SUB_ACCEPT,
  render(root, incoming) {
    let cues = [], vfile = null, raf = 0;
    const vid = player('vid-player vid-under');
    const overlay = h('canvas', { class: 'vid-overlay' });
    const stage = h('div', { class: 'vid-stage' }, vid, overlay);
    const subText = h('textarea', { class: 'input mono', rows: 6, placeholder: '1\n00:00:01,000 --> 00:00:03,000\nHello there', spellcheck: false });
    const subInfo = h('p', { class: 'field-hint' });
    const subDrop = h('label', { class: 'drop' }, h('input', { type: 'file', accept: '.srt,.vtt,text/vtt', hidden: true }), h('span', {}, 'Drop an .srt or .vtt file, or tap to choose'));
    const size = h('input', { type: 'range', min: 3, max: 12, step: 0.5, value: DEFAULT_STYLE.size });
    const colour = h('input', { type: 'color', value: DEFAULT_STYLE.colour, class: 'vid-colour' });
    const edge = h('input', { type: 'color', value: DEFAULT_STYLE.edge, class: 'vid-colour' });
    const look = select([['outline', 'Outline'], ['box', 'Box behind'], ['shadow', 'Soft shadow'], ['none', 'Plain']], 'outline');
    const pos = select([['bottom', 'Bottom'], ['middle', 'Middle'], ['top', 'Top']], 'bottom');
    const margin = h('input', { type: 'range', min: 0, max: 25, step: 1, value: DEFAULT_STYLE.margin });
    const font = select([['sans', 'Sans-serif'], ['serif', 'Serif'], ['mono', 'Monospace']], 'sans');
    const go = h('button', { class: 'btn primary', type: 'button' }, 'Burn in and export');
    const bar = progress();
    const res = resultBox();
    const style = () => ({ size: +size.value, colour: colour.value, edge: edge.value, look: look.value, position: pos.value, margin: +margin.value, font: font.value });
    const editor = h('div', { class: 'stack', hidden: true }, stage);
    const styleCard = card(h('h3', {}, 'Look'),
      h('div', { class: 'grid2' }, field('Text size', size), field('Distance from edge', margin)),
      h('div', { class: 'grid2' }, field('Text colour', colour), field('Outline / box colour', edge)),
      h('div', { class: 'grid2' }, field('Style', look), field('Position', pos)),
      field('Font', font),
      h('p', { class: 'field-hint' }, 'The preview is drawn exactly the way the export will be. Exporting re-encodes the picture; the sound is copied as it is.'),
      row(go), bar.el);
    const slot = videoSlot({ label: 'Drop a video here (or a video and its .srt together), or tap to choose', onfile: loadVideo });
    root.append(card(slot.el, editor), card(h('h3', {}, 'Subtitles'), subDrop, field('Or paste / edit them here', subText), subInfo), styleCard, res.el);
    if (!hasVideoEncoder()) { go.disabled = true; styleCard.append(h('p', { class: 'note error' }, 'This browser cannot encode video, so it can preview but not export. Try Chrome, Edge or Safari 16.4+.')); }

    async function loadVideo(file) {
      res.hide();
      const v = await openVideo(file);
      try {
        if (!v.video) throw new Error('This file has no picture.');
        if (!hasWebCodecs() || !(await v.video.canDecode())) throw new NeedsBigEngine('This browser cannot decode this video.');
        overlay.width = (await v.video.getDisplayWidth()) & ~1; overlay.height = (await v.video.getDisplayHeight()) & ~1;
        stage.style.maxWidth = `min(100%, calc(62vh * ${overlay.width / overlay.height}))`;
      } finally { v.close(); }
      vfile = file; vid.setFile(file); editor.hidden = false; paint();
    }
    function setSubs(text) {
      cues = parseSubs(text);
      subInfo.textContent = cues.length ? `${cues.length} subtitle${cues.length > 1 ? 's' : ''}, from ${fmtTime(cues[0].start)} to ${fmtTime(cues.at(-1).end)}` : (text.trim() ? 'No subtitles found — check the times look like 00:00:01,000 --> 00:00:03,000' : '');
      paint();
    }
    subText.addEventListener('input', () => setSubs(subText.value));
    const takeSubFile = async f => { subText.value = await f.text(); setSubs(subText.value); };
    subDrop.querySelector('input').addEventListener('change', e => { if (e.target.files[0]) takeSubFile(e.target.files[0]); e.target.value = ''; });
    subDrop.addEventListener('dragover', e => { e.preventDefault(); subDrop.classList.add('over'); });
    subDrop.addEventListener('dragleave', () => subDrop.classList.remove('over'));
    subDrop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); subDrop.classList.remove('over'); if (e.dataTransfer.files[0]) takeSubFile(e.dataTransfer.files[0]); });
    // Preview: if no subtitle is on screen right now, show the first one so the style can be seen.
    function paint() {
      const x = overlay.getContext('2d');
      x.clearRect(0, 0, overlay.width, overlay.height);
      const t = vid.currentTime;
      const showing = cues.some(c => t >= c.start && t < c.end);
      if (showing) drawSubs(x, cues, t, overlay.width, overlay.height, style());
      else if (vid.paused && cues[0]) drawSubs(x, cues, cues[0].start, overlay.width, overlay.height, style());
    }
    const loopPaint = () => { paint(); raf = requestAnimationFrame(loopPaint); };
    raf = requestAnimationFrame(loopPaint);
    for (const el of [size, colour, edge, look, pos, margin, font]) el.addEventListener('input', paint);
    go.onclick = async () => {
      if (!vfile) { slot.err.error('Add a video first.'); return; }
      if (!cues.length) { slot.err.error('Add some subtitles first.'); return; }
      try {
        const st = style(), cs = cues;
        const f = await busy(go, bar, 'Burning in the subtitles…', p => processVideo(vfile, (ctx, t, W, H) => drawSubs(ctx, cs, t, W, H, st), p));
        res.show(f, { kind: 'video', line: `${cs.length} subtitles burned in` });
      } catch (e) { slot.err.error(e.message); }
    };
    if (incoming?.files?.length) {
      const subs = incoming.files.find(f => /\.(srt|vtt)$/i.test(f.name));
      const video = incoming.files.find(f => f !== subs);
      if (subs) takeSubFile(subs);
      if (video) slot.load(video);
    }
    return () => { cancelAnimationFrame(raf); vid.dispose(); res.dispose(); };
  },
};

export default [atlas, audioOut, muter, trimmer, gifTool, frames, recorder, studio];
export { gifInfo, VIDEO_INPUT };
