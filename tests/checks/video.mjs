// Checks for the video tools. The test videos are made inside the page: a
// canvas animation plus a 440 Hz tone, encoded with WebCodecs through
// mediabunny (WebM VP8+Opus, and MP4 H.264+AAC), 320×240, 2 s, 30 fps.
import { set, giveFile, until, wait } from '../helpers.mjs';

const MB = `await import(new URL('vendor/mediabunny.js', location.href))`;

// JS expression for a fixture File; cached on window so it is made once per run.
const fixture = (kind = 'webm') => `(async () => {
  window.__vfix ||= {};
  if (window.__vfix['${kind}']) return window.__vfix['${kind}'];
  const M = ${MB};
  const mp4 = '${kind}' === 'mp4';
  const c = new OffscreenCanvas(320, 240), x = c.getContext('2d');
  const out = new M.Output({ format: mp4 ? new M.Mp4OutputFormat() : new M.WebMOutputFormat(), target: new M.BufferTarget() });
  const vs = new M.CanvasSource(c, { codec: mp4 ? 'avc' : 'vp8', bitrate: 1e6, keyFrameInterval: 1 });
  out.addVideoTrack(vs, { frameRate: 30 });
  const as = new M.AudioBufferSource({ codec: mp4 ? 'aac' : 'opus', bitrate: 96e3 });
  out.addAudioTrack(as);
  await out.start();
  const ab = new AudioBuffer({ length: 96000, sampleRate: 48000, numberOfChannels: 2 });
  for (let ch = 0; ch < 2; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / 48000); }
  await as.add(ab);
  for (let i = 0; i < 60; i++) {
    x.fillStyle = '#10204a'; x.fillRect(0, 0, 320, 240);
    x.fillStyle = '#e04020'; x.fillRect(20 + i * 4, 30, 40, 40);
    x.fillStyle = '#20a040'; x.fillRect(0, 230, 320 * i / 60, 10);
    await vs.add(i / 30, 1 / 30);
  }
  await out.finalize();
  const f = new File([out.target.buffer], 'fixture.' + (mp4 ? 'mp4' : 'webm'), { type: mp4 ? 'video/mp4' : 'video/webm' });
  window.__vfix['${kind}'] = f;
  return f;
})()`;

// Reads the result file (from the result box's blob URL) into window.__out.
const grabResult = () => `(() => { window.__out = document.querySelector('.vid-result').file; })()`;
// Probes window.__out (or a given expression) with mediabunny.
const probeOut = (expr = 'window.__out') => `(async () => { const M = ${MB}; const inp = new M.Input({ source: new M.BlobSource(${expr}), formats: M.ALL_FORMATS }); const r = { dur: await inp.computeDuration(), v: (await inp.getVideoTracks()).length, a: (await inp.getAudioTracks()).length, acodec: await (await inp.getPrimaryAudioTrack())?.getCodec(), fmt: (await inp.getFormat()).name }; window.__probe = r; return ''; })()`;
const clickText = (t, sel = 'button') => `[...document.querySelectorAll('${sel}')].find(b => b.textContent.trim() === ${JSON.stringify(t)}).click()`;
const resultReady = (ms = 30000) => until(`!document.querySelector('.vid-result').hidden`, ms);
const resetResult = `document.querySelector('.vid-result').hidden = true`;

export default {
  'video-atlas': [
    giveFile('input[type=file]', fixture('mp4')),
    until(`document.querySelectorAll('.vid-strip canvas').length === 8`, 20000),
    `(() => { const t = document.querySelector('.vid-info').textContent; const bad = [];
      if (!t.includes('320×240')) bad.push('size'); if (!t.includes('30 fps')) bad.push('fps'); if (!/0:02\\.0\\d|0:01\\.9\\d/.test(t)) bad.push('length');
      if (!t.includes('H.264')) bad.push('codec'); if (!t.includes('AAC') || !t.includes('stereo')) bad.push('sound'); if (!t.includes('4:3')) bad.push('ratio');
      return bad.length ? 'atlas missing: ' + bad.join(', ') + ' — ' + t.slice(0, 200) : ''; })()`,
    `(document.querySelectorAll('.vid-strip canvas')[0].width === 240 ? '' : 'strip frame width ' + document.querySelectorAll('.vid-strip canvas')[0].width)`,
    `(document.querySelectorAll('.vid-actions .chip').length >= 5 ? '' : 'too few send-on buttons')`,
    // An AVI is beyond the browser engine: the big-engine offer appears (nothing is downloaded here).
    giveFile('input[type=file]', `new File([new Uint8Array([82,73,70,70,200,0,0,0,65,86,73,32,76,73,83,84,4,0,0,0,104,100,114,108])], 'old.avi', { type: 'video/x-msvideo' })`),
    until(`document.querySelector('.vid-big')`, 5000),
    `(document.querySelector('.vid-big')?.textContent.includes('(avi)') && !document.querySelector('.heavy-ask') ? '' : 'avi should offer the big engine')`,
  ],
  'video-extract-audio': [
    giveFile('input[type=file]', fixture('webm')),
    until(`document.querySelector('.big-say')?.textContent.includes('Opus')`, 10000),
    clickText('Pull out the audio'), resultReady(),
    `(document.querySelector('.vid-meta').textContent.includes('.ogg') ? '' : 'original opus should be .ogg: ' + document.querySelector('.vid-meta').textContent)`,
    grabResult(), probeOut(),
    `(window.__probe.v === 0 && window.__probe.a === 1 && window.__probe.acodec === 'opus' && Math.abs(window.__probe.dur - 2) < 0.15 ? '' : 'ogg out: ' + JSON.stringify(window.__probe))`,
    resetResult, clickText('WAV', '.tabs button'), clickText('Pull out the audio'), resultReady(),
    grabResult(),
    `(async () => { const b = new DataView(await window.__out.arrayBuffer()); const ch = b.getUint16(22, true), rate = b.getUint32(24, true), bytes = b.getUint32(40, true); const dur = bytes / (ch * 2 * rate);
      return ch === 2 && Math.abs(dur - 2) < 0.15 ? '' : 'wav: ch ' + ch + ' rate ' + rate + ' dur ' + dur; })()`,
  ],
  'video-mute': [
    giveFile('input[type=file]', fixture('webm')),
    until(`document.querySelector('.big-say')?.textContent.includes('sound track')`, 10000),
    clickText('Remove the sound'), resultReady(),
    grabResult(), probeOut(),
    `(window.__probe.a === 0 && window.__probe.v === 1 && Math.abs(window.__probe.dur - 2) < 0.1 ? '' : 'muted: ' + JSON.stringify(window.__probe))`,
    // The workflow step does the same without the page.
    `(async () => { const t = (await import(new URL('js/tools/video.js', location.href))).default.find(t => t.id === 'video-mute'); const [f] = await t.steps[0].run([await ${fixture('mp4')}], {}, { progress() {} }); window.__out = f; return f.name === 'fixture-muted.mp4' ? '' : 'step name ' + f.name; })()`,
    probeOut(), `(window.__probe.a === 0 && window.__probe.v === 1 ? '' : 'mute step: ' + JSON.stringify(window.__probe))`,
  ],
  'video-trim': [
    giveFile('input[type=file]', fixture('webm')),
    until(`document.querySelector('.vt-labels')?.textContent.includes('0:02')`, 10000),
    set('input[type=number]', '0.5', 0), set('input[type=number]', '1.5', 1),
    until(`document.querySelectorAll('.field-hint')[1]?.textContent.includes('key frame')`, 5000), wait(400),
    `(/start at 0:00\\.00, 0\\.50 s before/.test(document.querySelector('.tool-body').textContent) ? '' : 'key frame note: ' + [...document.querySelectorAll('.field-hint')].map(e => e.textContent).join(' | '))`,
    clickText('Cut'), resultReady(), grabResult(), probeOut(),
    `(Math.abs(window.__probe.dur - 1.5) < 0.1 && window.__probe.a === 1 ? '' : 'quick cut should run 0..1.5: ' + JSON.stringify(window.__probe))`,
    resetResult, clickText('Exact (re-encode)', '.tabs button'), clickText('Cut'), resultReady(40000), grabResult(), probeOut(),
    `(Math.abs(window.__probe.dur - 1.0) < 0.1 ? '' : 'exact cut should be 1 s: ' + JSON.stringify(window.__probe))`,
  ],
  'video-gif': [
    giveFile('input[type=file]', fixture('webm')),
    until(`document.querySelector('.vid-est')?.textContent.includes('about')`, 15000),
    set('select', '10', 0), set('input[type=number]', '160', 2), set('input[type=number]', '1', 1),
    clickText('Make it'), resultReady(),
    `(async () => { const b = new Uint8Array(await (await fetch(document.querySelector('.vid-out-img').src)).arrayBuffer()); const { gifInfo } = await import(new URL('js/tools/video.js', location.href)); const g = gifInfo(b);
      return g.frames === 10 && g.width === 160 && g.height === 120 ? '' : 'gif: ' + JSON.stringify(g); })()`,
    // Animated WebP, where the browser can encode WebP.
    resetResult, clickText('Animated WebP', '.tabs button'), clickText('Make it'), resultReady(),
    `(async () => { const b = new Uint8Array(await (await fetch(document.querySelector('.vid-out-img').src)).arrayBuffer()); const s = new TextDecoder().decode(b); const n = s.split('ANMF').length - 1;
      const img = new Image(); img.src = document.querySelector('.vid-out-img').src; await img.decode();
      return s.startsWith('RIFF') && s.includes('ANIM') && n === 10 && img.naturalWidth === 160 ? '' : 'webp frames ' + n + ' w ' + img.naturalWidth; })()`,
    // The workflow step: whole 2 s clip at 5 fps.
    `(async () => { const m = await import(new URL('js/tools/video.js', location.href)); const t = m.default.find(t => t.id === 'video-gif'); const [f] = await t.steps[0].run([await ${fixture('mp4')}], { fps: 5, width: 100, start: 0, duration: 0 }, { progress() {} });
      const g = m.gifInfo(new Uint8Array(await f.arrayBuffer())); return f.name === 'fixture.gif' && g.frames === 10 && g.width === 100 && g.height === 74 ? '' : 'gif step: ' + f.name + ' ' + JSON.stringify(g); })()`,
    `(async () => { const t = (await import(new URL('js/tools/video.js', location.href))).default.find(t => t.id === 'video-extract-audio'); const [f] = await t.steps[0].run([await ${fixture('mp4')}], { format: 'original' }, { progress() {} }); window.__out = f; return f.name === 'fixture-audio.m4a' ? '' : 'audio step name ' + f.name; })()`,
    probeOut(), `(window.__probe.acodec === 'aac' && window.__probe.v === 0 ? '' : 'audio step: ' + JSON.stringify(window.__probe))`,
  ],
  'video-frames': [
    giveFile('input[type=file]', fixture('webm')),
    until(`!document.querySelector('.vid-player')?.closest('.stack').hidden && document.querySelector('.vid-player').readyState >= 1`, 10000),
    `(async () => { const v = document.querySelector('.vid-player'); v.currentTime = 1.0; await new Promise(r => v.addEventListener('seeked', r, { once: true })); })()`,
    clickText('Save this frame'), resultReady(),
    `(async () => { const img = document.querySelector('.vid-out-img'); await img.decode(); const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const px = [...x.getImageData(20 + 30 * 4 + 20, 50, 1, 1).data]; const name = document.querySelector('.vid-meta').textContent;
      return img.naturalWidth === 320 && img.naturalHeight === 240 && px[0] > 180 && px[2] < 90 && name.includes('1_00s') ? '' : 'still: ' + img.naturalWidth + 'x' + img.naturalHeight + ' px ' + px + ' ' + name; })()`,
    resetResult, clickText('Every few seconds', '.tabs button'), set('input[type=number]', '0.5', 0),
    clickText('Make the zip'), resultReady(),
    grabResult(),
    `(async () => { const { unzipSync } = await import(new URL('vendor/fflate.js', location.href)); const z = unzipSync(new Uint8Array(await window.__out.arrayBuffer())); const names = Object.keys(z);
      const bmp = await createImageBitmap(new Blob([z[names[0]]], { type: 'image/png' }));
      return names.length === 4 && bmp.width === 320 && bmp.height === 240 && names[3].endsWith('1.50s.png') ? '' : 'zip: ' + names.join(',') + ' ' + bmp.width; })()`,
    `(document.querySelector('.vid-meta').textContent.includes('4 frames') ? '' : 'zip count: ' + document.querySelector('.vid-meta').textContent)`,
    resetResult, clickText('Contact sheet', '.tabs button'), set('select', '2', 2), set('select', '2', 3),
    clickText('Make the sheet'), resultReady(),
    `(async () => { const img = document.querySelector('.vid-out-img'); await img.decode(); return img.naturalWidth === 664 && img.naturalHeight === 552 ? '' : 'sheet size ' + img.naturalWidth + 'x' + img.naturalHeight; })()`,
  ],
  'screen-rec': [
    `(document.querySelectorAll('select option').length >= 1 && [...document.querySelectorAll('button')].some(b => b.textContent === 'Choose what to record') ? '' : 'recorder UI missing')`,
    // Record a 1.2 s canvas animation through the same recorder code and tidy it.
    `(async () => { const r = await import(new URL('js/lib/video-rec.js', location.href)); const c = document.createElement('canvas'); c.width = 160; c.height = 120; const x = c.getContext('2d'); let i = 0;
      const t = setInterval(() => { x.fillStyle = i++ % 2 ? '#c33' : '#33c'; x.fillRect(0, 0, 160, 120); }, 33);
      const fmt = r.recordFormats().find(f => f[2] === 'webm')[0]; const rec = r.recordStream(c.captureStream(30), fmt); await new Promise(res => setTimeout(res, 1200));
      const blob = await rec.stop(); clearInterval(t); const f = await r.tidyRecording(blob, 'rec.webm'); window.__out = f; })()`,
    probeOut(), `(window.__probe.v === 1 && window.__probe.dur > 0.8 && window.__probe.dur < 1.7 ? '' : 'recording: ' + JSON.stringify(window.__probe))`,
    `(async () => { const r = await import(new URL('js/lib/video-rec.js', location.href)); const m = r.mixAudio([new MediaStream()]); return m.track === null ? '' : 'mix of silent streams should be null'; })()`,
  ],
  'subtitle-burn': [
    // Video and subtitles arrive together, as from a drop or Send to.
    `(async () => { const { sendTo } = await import(new URL('js/hub.js', location.href)); sendTo('subtitle-burn', { files: [await ${fixture('webm')}, new File(['1\\n00:00:00,000 --> 00:00:01,000\\nHELLO WORLD\\n\\n2\\n00:00:01,000 --> 00:00:02,000\\n<i>Second</i> line'], 'subs.srt', { type: '' })] }); await new Promise(r => setTimeout(r, 500)); })()`,
    until(`!document.querySelector('.vid-stage').closest('.stack').hidden`, 10000), wait(300),
    `(document.querySelector('textarea').value.includes('HELLO') ? '' : 'srt not loaded from the drop')`,
    `(() => { const t = [...document.querySelectorAll('.field-hint')].map(e => e.textContent).join(' '); return t.includes('2 subtitles, from 0:00.00 to 0:02.00') ? '' : 'cue info: ' + t; })()`,
    `(() => { const c = document.querySelector('.vid-overlay'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n > 200 ? '' : 'preview not drawn: ' + n; })()`,
    clickText('Burn in and export'), resultReady(60000),
    grabResult(), probeOut(),
    `(Math.abs(window.__probe.dur - 2) < 0.1 && window.__probe.a === 1 ? '' : 'burned: ' + JSON.stringify(window.__probe))`,
    // White text pixels near the bottom of the frame at 0.5 s — none in the original.
    `(async () => { const M = ${MB}; const white = async b => { const inp = new M.Input({ source: new M.BlobSource(b), formats: M.ALL_FORMATS }); const s = new M.CanvasSink(await inp.getPrimaryVideoTrack()); const w = await s.getCanvas(0.5); const x = w.canvas.getContext('2d'); const d = x.getImageData(0, 160, 320, 70).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220) n++; return n; };
      const a = await white(window.__vfix.webm), b = await white(window.__out); return a < 5 && b > 150 ? '' : 'burned text pixels: before ' + a + ' after ' + b; })()`,
  ],
};
