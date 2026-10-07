// Video engine for the video tools. Built on mediabunny (MPL-2.0, vendor/mediabunny.js):
// it reads and writes MP4/MOV/WebM/MKV in plain JS and uses the browser's own
// WebCodecs for decoding/encoding. Copy-only jobs (mute, quick trim, pulling the
// audio out) never decode, so they work even where WebCodecs is missing.
let mbP;
export const mb = () => (mbP ||= import('../../vendor/mediabunny.js'));

export const VIDEO_ACCEPT = ['video/*', '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];
export const VIDEO_INPUT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi';

// Thrown when the browser engine cannot read or decode a file; tools then offer
// the big engine (ffmpeg) to turn it into an MP4 first.
export class NeedsBigEngine extends Error {
  constructor(msg) { super(msg); this.bigEngine = true; }
}

export const hasWebCodecs = () => typeof VideoDecoder === 'function';
export const hasVideoEncoder = () => typeof VideoEncoder === 'function';
export const hasAudioDecoder = () => typeof AudioDecoder === 'function';

// m:ss.cc — short and readable; hours only when needed.
export function fmtTime(s, digits = 2) {
  if (!isFinite(s)) return '—';
  const neg = s < 0; s = Math.abs(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  const sec = (s % 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0');
  return (neg ? '-' : '') + (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + sec;
}
// Accepts "75", "1:15", "1:15.5", "0:01:15".
export function parseTime(t) {
  const parts = String(t).trim().split(':').map(Number);
  if (!parts.length || parts.some(n => !isFinite(n))) return NaN;
  return parts.reduce((a, n) => a * 60 + n, 0);
}

const CONTAINER = {
  'video/webm': 'webm', 'audio/webm': 'webm', 'video/x-matroska': 'mkv', 'audio/x-matroska': 'mkv',
  'video/quicktime': 'mov', 'video/mp4': 'mp4', 'audio/mp4': 'mp4',
};

export async function openVideo(file) {
  const M = await mb();
  const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
  let fmt;
  try { fmt = await input.getFormat(); } catch {
    input.dispose?.();
    throw new NeedsBigEngine(`The browser engine cannot read this kind of file (${ext(file.name) || file.type || 'unknown'}).`);
  }
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return { M, input, fmt, video, audio, container: CONTAINER[fmt.mimeType] || 'mp4', close: () => input.dispose?.() };
}

const ext = name => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// Opens a file and makes sure its video can be decoded here (for frame work).
export async function openDecodable(file) {
  const v = await openVideo(file);
  if (!v.video) { v.close(); throw new Error('There is no picture in this file — it only has sound.'); }
  if (!hasWebCodecs()) { v.close(); throw new Error('This browser cannot decode video frames (no WebCodecs). Try a recent Chrome, Edge or Safari 16.4+.'); }
  if (!(await v.video.canDecode())) {
    const c = await v.video.getCodec();
    v.close();
    throw new NeedsBigEngine(`This browser cannot decode ${codecName(c)} video.`);
  }
  return v;
}

export const codecName = c => ({
  avc: 'H.264', hevc: 'H.265 (HEVC)', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', prores: 'ProRes',
  aac: 'AAC', opus: 'Opus', mp3: 'MP3', vorbis: 'Vorbis', flac: 'FLAC', ac3: 'Dolby AC-3', eac3: 'Dolby E-AC-3', dts: 'DTS',
}[c] || (c?.startsWith('pcm') ? 'PCM (uncompressed)' : c || 'unknown'));

// Everything we can learn about one file.
export async function probe(file) {
  const v = await openVideo(file);
  try {
    const { input, fmt, video, audio } = v;
    const duration = await input.computeDuration();
    const info = { container: fmt.name, mime: fmt.mimeType, duration, size: file.size, bitrate: duration ? file.size * 8 / duration : 0 };
    if (video) {
      const stats = await video.computePacketStats(300);
      Object.assign(info, {
        vcodec: await video.getCodec(), vcodecString: await video.getCodecParameterString().catch(() => null),
        width: await video.getDisplayWidth(), height: await video.getDisplayHeight(),
        codedWidth: await video.getCodedWidth(), codedHeight: await video.getCodedHeight(),
        rotation: await video.getRotation(), fps: stats.averagePacketRate, frames: stats.packetCount,
        vbitrate: stats.averageBitrate, canDecode: hasWebCodecs() && await video.canDecode(),
        hdr: await video.hasHighDynamicRange().catch(() => false),
      });
    }
    if (audio) {
      const st = await audio.computePacketStats(300).catch(() => null);
      Object.assign(info, {
        acodec: await audio.getCodec(), channels: await audio.getNumberOfChannels(),
        sampleRate: await audio.getSampleRate(), abitrate: st?.averageBitrate || null,
        language: audio.languageCode && audio.languageCode !== 'und' ? audio.languageCode : null,
      });
    }
    info.audioTracks = (await input.getAudioTracks()).length;
    info.videoTracks = (await input.getVideoTracks()).length;
    const tags = await input.getMetadataTags().catch(() => ({}));
    if (tags.date instanceof Date && !isNaN(tags.date) && tags.date.getFullYear() > 1971) info.created = tags.date;
    if (tags.title) info.title = tags.title;
    // QuickTime/iPhone files keep a creation date and sometimes a location in raw tags.
    const raw = tags.raw || {};
    for (const [k, val] of Object.entries(raw)) {
      if (typeof val !== 'string') continue;
      if (!info.created && /creationdate|creation_time|date/i.test(k)) { const d = new Date(val); if (!isNaN(d)) info.created = d; }
      if (/location|©xyz/i.test(k) && /[+-]\d/.test(val)) info.location = val;
      if (/make$|model$|software/i.test(k)) (info.device ||= []).push(val);
    }
    return info;
  } finally { v.close(); }
}

// Output format matching the input's container where the codecs allow it.
function outFormatFor(M, container, codecs = []) {
  const webmOk = codecs.every(c => !c || ['vp8', 'vp9', 'av1', 'opus', 'vorbis'].includes(c));
  if (container === 'webm' && webmOk) return { format: new M.WebMOutputFormat(), ext: 'webm', mime: 'video/webm' };
  if (container === 'mkv') return { format: new M.MkvOutputFormat(), ext: 'mkv', mime: 'video/x-matroska' };
  if (container === 'mov') return { format: new M.MovOutputFormat(), ext: 'mov', mime: 'video/quicktime' };
  return { format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), ext: 'mp4', mime: 'video/mp4' };
}

async function runConversion(M, opts, onProgress) {
  const conv = await M.Conversion.init({ showWarnings: false, ...opts });
  if (!conv.isValid) {
    const why = conv.discardedTracks.map(d => `${d.track.type} (${d.reason.replace(/_/g, ' ')})`).join(', ');
    throw new Error('This file cannot be converted here' + (why ? ': ' + why : '.'));
  }
  if (onProgress) conv.onProgress = p => onProgress(p);
  await conv.execute();
  return conv;
}

const newOutput = (M, format) => new M.Output({ format, target: new M.BufferTarget() });
const base = name => name.replace(/\.[^.]+$/, '');

// Removes the sound. Packets are copied as they are — no quality loss.
export async function muteVideo(file, onProgress) {
  const v = await openVideo(file);
  try {
    if (!v.video) throw new Error('This file has no picture to keep.');
    const out = outFormatFor(v.M, v.container, [await v.video.getCodec()]);
    const output = newOutput(v.M, out.format);
    await runConversion(v.M, { input: v.input, output, audio: { discard: true }, video: {} }, onProgress);
    return new File([output.target.buffer], `${base(file.name)}-muted.${out.ext}`, { type: out.mime });
  } finally { v.close(); }
}

// Where the audio goes when kept as it is (no re-encode).
export function audioHomeFor(M, codec) {
  if (codec === 'aac') return { format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), ext: 'm4a', mime: 'audio/mp4' };
  if (codec === 'mp3') return { format: new M.Mp3OutputFormat(), ext: 'mp3', mime: 'audio/mpeg' };
  if (codec === 'opus' || codec === 'vorbis') return { format: new M.OggOutputFormat(), ext: 'ogg', mime: 'audio/ogg' };
  if (codec === 'flac') return { format: new M.FlacOutputFormat(), ext: 'flac', mime: 'audio/flac' };
  if (codec?.startsWith('pcm')) return { format: new M.WavOutputFormat(), ext: 'wav', mime: 'audio/wav' };
  return { format: new M.MkvOutputFormat(), ext: 'mka', mime: 'audio/x-matroska' };
}

// Pulls the audio out. 'original' copies the packets into a fitting file;
// 'wav' decodes to 16-bit PCM (with WebCodecs, or Web Audio when that's missing).
export async function extractAudio(file, format = 'original', onProgress) {
  const v = await openVideo(file);
  try {
    if (!v.audio) throw new Error('This video has no sound track.');
    const codec = await v.audio.getCodec();
    if (format === 'original') {
      const out = audioHomeFor(v.M, codec);
      const output = newOutput(v.M, out.format);
      await runConversion(v.M, { input: v.input, output, video: { discard: true }, audio: {} }, onProgress);
      return new File([output.target.buffer], `${base(file.name)}-audio.${out.ext}`, { type: out.mime });
    }
    if (hasAudioDecoder() && await v.audio.canDecode()) {
      const output = newOutput(v.M, new v.M.WavOutputFormat());
      await runConversion(v.M, { input: v.input, output, video: { discard: true }, audio: { codec: 'pcm-s16' } }, onProgress);
      return new File([output.target.buffer], `${base(file.name)}-audio.wav`, { type: 'audio/wav' });
    }
  } finally { v.close(); }
  // No AudioDecoder (Safari before 26): let Web Audio decode the whole file.
  onProgress?.(0.3);
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  onProgress?.(0.9);
  return new File([wavFromBuffer(buf)], `${base(file.name)}-audio.wav`, { type: 'audio/wav' });
}

// 16-bit PCM WAV from an AudioBuffer.
export function wavFromBuffer(buf) {
  const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate;
  const dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]));
    dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}

// The key frame at or before t — where a no-re-encode cut really starts.
export async function keyFrameBefore(file, t) {
  const v = await openVideo(file);
  try {
    if (!v.video) return t;
    const sink = new v.M.EncodedPacketSink(v.video);
    const p = await sink.getKeyPacket(t, { metadataOnly: true });
    return p ? p.timestamp : 0;
  } finally { v.close(); }
}

// Cuts start..end. exact=false copies packets (starts on the key frame before
// `start`); exact=true re-encodes the picture so the cut lands on the frame.
export async function trimVideo(file, { start, end, exact = false }, onProgress) {
  const v = await openVideo(file);
  try {
    const codecs = [await v.video?.getCodec(), await v.audio?.getCodec()];
    if (exact && !hasVideoEncoder()) throw new Error('Exact cuts need video encoding, which this browser lacks. Use the quick (key frame) cut.');
    // An exact cut is re-encoded, so WebM input may come out as MP4 if VP8/VP9 cannot be encoded.
    const out = outFormatFor(v.M, v.container, exact ? [] : codecs);
    const output = newOutput(v.M, out.format);
    await runConversion(v.M, {
      input: v.input, output, trim: { start, end },
      video: exact ? { forceTranscode: true } : {},
      audio: {},
      copy: exact ? undefined : { boundaryPolicy: 'expand', shiftTolerance: Infinity },
    }, onProgress);
    return new File([output.target.buffer], `${base(file.name)}-cut.${out.ext}`, { type: out.mime });
  } finally { v.close(); }
}

// A copy of a canvas (CanvasSink reuses its own canvases).
export function copyCanvas(src, w = src.width, h = src.height) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}

// Decoded frames at the given times (sorted), as canvases of `width` px wide.
export async function framesAt(file, times, { width, onFrame } = {}) {
  const v = await openDecodable(file);
  try {
    const sink = new v.M.CanvasSink(v.video, { width: width || undefined, poolSize: 0 });
    const out = [];
    let i = 0;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      const c = wc ? copyCanvas(wc.canvas) : null;
      out.push({ canvas: c, timestamp: wc?.timestamp ?? times[i] });
      onFrame?.(i, c);
      i++;
    }
    return out;
  } finally { v.close(); }
}

export async function durationOf(file) {
  const v = await openVideo(file);
  try { return await v.input.computeDuration(); } finally { v.close(); }
}

// Re-encodes the picture through a canvas hook — used to burn in subtitles.
export async function processVideo(file, draw, onProgress) {
  const v = await openDecodable(file);
  try {
    if (!hasVideoEncoder()) throw new Error('This browser cannot encode video (no WebCodecs encoder).');
    const M = v.M;
    const w = await v.video.getDisplayWidth(), h = await v.video.getDisplayHeight();
    // Even sizes keep H.264 encoders happy.
    const W = w & ~1, H = h & ~1;
    let out = { format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), ext: 'mp4', mime: 'video/mp4' };
    let vcodec = (await M.canEncodeVideo('avc', { width: W, height: H })) ? 'avc' : null;
    if (!vcodec) {
      vcodec = await M.getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width: W, height: H });
      out = { format: new M.WebMOutputFormat(), ext: 'webm', mime: 'video/webm' };
    }
    if (!vcodec) throw new Error('No video encoder is available in this browser.');
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const output = newOutput(M, out.format);
    await runConversion(M, {
      input: v.input, output,
      video: {
        codec: vcodec, forceTranscode: true, processedWidth: W, processedHeight: H,
        process: sample => { sample.draw(ctx, 0, 0, W, H); draw(ctx, sample.timestamp, W, H); return canvas; },
      },
      audio: {},
    }, onProgress);
    return new File([output.target.buffer], `${base(file.name)}-subtitled.${out.ext}`, { type: out.mime });
  } finally { v.close(); }
}
