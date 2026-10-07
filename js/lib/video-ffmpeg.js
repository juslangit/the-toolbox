// The big engine: ffmpeg compiled to WebAssembly, for files the browser engine
// cannot read (AVI, old codecs, HEVC where the browser lacks a decoder).
// The small wrapper (@ffmpeg/ffmpeg + @ffmpeg/util, MIT) is vendored because its
// module worker must be same-origin. The ~31 MB core (@ffmpeg/core, GPL) is never
// in this repo: it is fetched from jsDelivr only after the person agrees, and the
// service worker keeps it for offline use. The single-thread core needs no COOP/COEP.
import { h } from '../ui.js';
import { askToFetch, markFetched } from './heavy.js';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
const ID = 'ffmpeg-core-0.12.10';
let ffP = null;

// root: where to show the ask card; null when the person has already agreed.
export async function loadFFmpeg(root) {
  if (root) await askToFetch(root, {
    id: ID, what: 'the big video engine', mb: 31,
    why: 'This file needs the big video engine (ffmpeg) to read it. It is downloaded once (about 31 MB), kept on this device and then works offline. Your video never leaves the device.',
  });
  if (!ffP) {
    ffP = (async () => {
      const { FFmpeg } = await import('../../vendor/ffmpeg/index.js');
      const ff = new FFmpeg();
      await ff.load({ coreURL: CORE + 'ffmpeg-core.js', wasmURL: CORE + 'ffmpeg-core.wasm' });
      markFetched(ID);
      return ff;
    })();
    ffP.catch(() => { ffP = null; });
  }
  return ffP;
}

// Runs ffmpeg on one file. args(inName, outName) → string[]. Returns a File.
export async function ffRun(root, file, { args, outName, type }, onProgress) {
  const ff = await loadFFmpeg(root);
  const inName = 'in.' + (file.name.match(/\.([^.]+)$/)?.[1] || 'bin').toLowerCase();
  const prog = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ff.on('progress', prog);
  try {
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    const code = await ff.exec(args(inName, 'out-' + outName));
    if (code !== 0) throw new Error('The big engine could not convert this file.');
    const data = await ff.readFile('out-' + outName);
    return new File([data], outName, { type });
  } finally {
    ff.off('progress', prog);
    ff.deleteFile(inName).catch(() => {});
    ff.deleteFile('out-' + outName).catch(() => {});
  }
}

// Turns anything ffmpeg reads into an H.264/AAC MP4 the browser engine can use.
export const toMp4 = (root, file, onProgress) => ffRun(root, file, {
  args: (i, o) => ['-i', i, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', o],
  outName: file.name.replace(/\.[^.]+$/, '') + '.mp4', type: 'video/mp4',
}, onProgress);

// A card offering the big engine when the browser engine gives up on a file.
// onReady(mp4File) continues the tool with the converted copy.
export function bigEngineCard(root, file, reason, onReady) {
  const bar = h('div', { class: 'meter' }, h('i'));
  const status = h('p', { class: 'field-hint' });
  const go = h('button', { class: 'btn primary', type: 'button' }, 'Convert to MP4 with the big engine');
  const el = h('section', { class: 'card vid-big' },
    h('h3', {}, 'This video needs the big engine'),
    h('p', {}, reason + ' The big engine (ffmpeg, about 31 MB, downloaded once) can turn it into an MP4 that every tool here can use. It is slower — a few minutes for a long clip.'),
    go, bar, status);
  bar.hidden = true;
  go.onclick = async () => {
    go.disabled = true;
    try {
      status.textContent = 'Loading the big engine…';
      await loadFFmpeg(null); // tapping the button was the agreement
      status.textContent = 'Converting…'; bar.hidden = false;
      const mp4 = await toMp4(null, file, p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; });
      el.remove();
      onReady(mp4);
    } catch (e) {
      go.disabled = false;
      status.textContent = 'Could not convert: ' + (e.message || e);
    }
  };
  root.append(el);
  return el;
}
