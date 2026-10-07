// Audio basics for the audio drawer: decode any file the browser can read
// into an AudioBuffer, and write PCM back out as a WAV file.

// A tiny stand-in for AudioBuffer, so code can make "buffers" without a context.
export function makeBuffer(channels, sampleRate) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0]?.length || 0,
    duration: (channels[0]?.length || 0) / sampleRate,
    getChannelData: i => channels[i],
  };
}

export const channelsOf = buf => Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));

// Writes 16-bit (default), 24-bit or 32-bit float WAV. buf is an AudioBuffer or makeBuffer().
export function encodeWav(buf, bits = 16) {
  const ch = channelsOf(buf);
  const n = buf.length, nc = ch.length, rate = buf.sampleRate;
  const float = bits === 32;
  const bps = bits / 8, block = nc * bps, dataLen = n * block;
  const out = new ArrayBuffer(44 + dataLen);
  const v = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * block, true); v.setUint16(32, block, true); v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  let o = 44;
  if (bits === 16) {
    const pcm = new Int16Array(out, 44, n * nc);
    for (let i = 0, k = 0; i < n; i++) {
      for (let c = 0; c < nc; c++, k++) {
        const s = Math.max(-1, Math.min(1, ch[c][i]));
        pcm[k] = Math.round(s < 0 ? s * 32768 : s * 32767);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nc; c++) {
        const s = Math.max(-1, Math.min(1, ch[c][i]));
        if (float) { v.setFloat32(o, ch[c][i], true); o += 4; }
        else { const x = Math.round(s < 0 ? s * 8388608 : s * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
      }
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

export const wavFile = (buf, name, bits = 16) => new File([encodeWav(buf, bits)], name, { type: 'audio/wav' });

// Decodes a File/Blob. sampleRate: keep the file's own rate when we know it
// (decodeAudioData resamples to the context's rate). 0 → browser default.
export async function decodeAudio(file, sampleRate = 0) {
  const data = await file.arrayBuffer();
  let rate = sampleRate;
  if (!rate || rate < 3000 || rate > 768000) rate = 48000;
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser cannot decode audio');
  const ctx = new Ctx(1, 1, rate);
  try {
    return await new Promise((res, rej) => {
      const p = ctx.decodeAudioData(data.slice(0), res, rej);
      if (p?.then) p.then(res, rej);
    });
  } catch (e) {
    // Chrome and Firefox can't decode AIFF; plain PCM is easy to read ourselves.
    const own = readAiff(new Uint8Array(data));
    if (own) return own;
    throw new Error('The browser could not decode this file' + (e?.message ? ` (${e.message})` : ''));
  }
}

// Uncompressed AIFF / AIFF-C (NONE, sowt, fl32, fl64) → makeBuffer(); null if not that.
function readAiff(u8) {
  const s = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
  if (s(0, 4) !== 'FORM' || !/^AIF[FC]$/.test(s(8, 4))) return null;
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let nc = 0, frames = 0, bits = 0, rate = 0, comp = 'NONE', data = -1;
  for (let o = 12; o + 8 <= u8.length;) {
    const id = s(o, 4), size = v.getUint32(o + 4);
    if (id === 'COMM') {
      nc = v.getUint16(o + 8); frames = v.getUint32(o + 10); bits = v.getUint16(o + 14);
      const exp = (v.getUint16(o + 16) & 0x7fff) - 16383;
      rate = Math.round((v.getUint32(o + 18) * 2 ** -31 + v.getUint32(o + 22) * 2 ** -63) * 2 ** exp);
      if (s(8, 4) === 'AIFC') comp = s(o + 26, 4);
    } else if (id === 'SSND') data = o + 16 + v.getUint32(o + 8);
    o += 8 + size + (size & 1);
  }
  if (!nc || data < 0 || !rate) return null;
  const le = comp === 'sowt', float = /^fl(32|64)$/i.test(comp);
  if (!['NONE', 'sowt', 'twos', 'in24', 'in32', 'fl32', 'FL32', 'fl64', 'FL64'].includes(comp)) return null;
  if (float) bits = /64/.test(comp) ? 64 : 32;
  const bps = Math.ceil(bits / 8);
  frames = Math.min(frames, Math.floor((u8.length - data) / (bps * nc)));
  const ch = Array.from({ length: nc }, () => new Float32Array(frames));
  for (let i = 0, o = data; i < frames; i++) {
    for (let c = 0; c < nc; c++, o += bps) {
      let x;
      if (float) x = bps === 8 ? v.getFloat64(o) : v.getFloat32(o);
      else if (bps === 1) x = v.getInt8(o) / 128;
      else if (bps === 2) x = v.getInt16(o, le) / 32768;
      else if (bps === 3) { const b = le ? (u8[o + 2] << 16) | (u8[o + 1] << 8) | u8[o] : (u8[o] << 16) | (u8[o + 1] << 8) | u8[o + 2]; x = ((b << 8) >> 8) / 8388608; }
      else x = v.getInt32(o, le) / 2147483648;
      ch[c][i] = x;
    }
  }
  return makeBuffer(ch, rate);
}

// Same channels, new sample rate.
export async function resample(buf, rate) {
  if (buf.sampleRate === rate) return buf;
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new Ctx(buf.numberOfChannels, Math.max(1, Math.ceil(buf.duration * rate)), rate);
  const src = ctx.createBufferSource();
  src.buffer = toAudioBuffer(buf);
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

// Mixes to mono at a new sample rate (for speech models: 16 kHz).
export async function toMonoRate(buf, rate) {
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const len = Math.max(1, Math.ceil(buf.duration * rate));
  const ctx = new Ctx(1, len, rate);
  const src = ctx.createBufferSource();
  src.buffer = buf instanceof AudioBuffer ? buf : toAudioBuffer(buf);
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

export function toAudioBuffer(b) {
  if (b instanceof AudioBuffer) return b;
  const ab = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: Math.max(1, b.length), sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) ab.copyToChannel(b.getChannelData(c), c);
  return ab;
}

// Test tone: a sine at `dbfs` peak for `seconds`, rendered offline (exact samples).
export async function toneBuffer({ freq = 1000, dbfs = -20, seconds = 2, rate = 48000, channels = 1, silenceAfter = 0 } = {}) {
  const amp = 10 ** (dbfs / 20);
  const n = Math.round(seconds * rate), tail = Math.round(silenceAfter * rate);
  const ch = [];
  for (let c = 0; c < channels; c++) {
    const a = new Float32Array(n + tail);
    for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * freq * i / rate);
    ch.push(a);
  }
  return makeBuffer(ch, rate);
}

export const fmtTime = (s, ms = true) => {
  if (!isFinite(s)) return '–';
  const neg = s < 0; s = Math.abs(s);
  const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  const sec = ms ? ss.toFixed(2).padStart(5, '0') : String(Math.floor(ss)).padStart(2, '0');
  return (neg ? '-' : '') + (hh ? `${hh}:${String(mm).padStart(2, '0')}` : String(mm)) + ':' + sec;
};
