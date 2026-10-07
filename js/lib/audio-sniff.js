// Reads the first bytes of an audio file to tell the container, codec, sample
// rate, channels, bit depth and the usual tags (title, artist, album, year,
// cover art). Hand-written for the common formats; anything it cannot read is
// simply left out, and the decoded audio fills in the rest.

const ascii = (u8, o, n) => { let s = ''; for (let i = 0; i < n && o + i < u8.length; i++) s += String.fromCharCode(u8[o + i]); return s; };
const be32 = (u8, o) => ((u8[o] << 24) >>> 0) + (u8[o + 1] << 16) + (u8[o + 2] << 8) + u8[o + 3];
const le32 = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
const be16 = (u8, o) => (u8[o] << 8) | u8[o + 1];
const le16 = (u8, o) => u8[o] | (u8[o + 1] << 8);
const utf8 = b => new TextDecoder('utf-8').decode(b).replace(/\0+$/, '');

export async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
  const info = { container: '', codec: '', tags: {} };
  try {
    const m4 = ascii(head, 0, 4);
    if (m4 === 'RIFF' && ascii(head, 8, 4) === 'WAVE') wav(head, info);
    else if (m4 === 'FORM' && /^AIF[FC]$/.test(ascii(head, 8, 4))) aiff(head, info);
    else if (m4 === 'fLaC') flac(head, 4, info);
    else if (m4 === 'OggS') ogg(head, info);
    else if (m4 === 'caff') caf(head, info);
    else if (ascii(head, 4, 4) === 'ftyp') await mp4(file, head, info);
    else if (be32(head, 0) === 0x1a45dfa3) mkv(head, info);
    else if (ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) mpeg(head, info);
  } catch { /* partial info is fine */ }
  return info;
}

// --- WAV ------------------------------------------------------------------
const WAV_FMT = { 1: 'PCM', 3: 'PCM (32-bit float)', 2: 'Microsoft ADPCM', 6: 'A-law', 7: 'µ-law', 0x11: 'IMA ADPCM', 0x55: 'MP3', 0xff: 'AAC' };
function wav(u8, info) {
  info.container = 'WAV (RIFF)';
  for (let o = 12; o + 8 <= u8.length;) {
    const id = ascii(u8, o, 4), size = le32(u8, o + 4);
    if (id === 'fmt ') {
      let tag = le16(u8, o + 8);
      info.channels = le16(u8, o + 10);
      info.sampleRate = le32(u8, o + 12);
      info.bitDepth = le16(u8, o + 22);
      if (tag === 0xfffe && size >= 40) tag = le16(u8, o + 32);
      info.codec = WAV_FMT[tag] || `format 0x${tag.toString(16)}`;
      if (tag === 3) info.codec = 'PCM float';
      info.lossless = tag === 1 || tag === 3;
    } else if (id === 'LIST' && ascii(u8, o + 8, 4) === 'INFO') {
      for (let p = o + 12; p + 8 <= o + 8 + size;) {
        const k = ascii(u8, p, 4), n = le32(u8, p + 4);
        const v = utf8(u8.subarray(p + 8, p + 8 + n));
        const map = { INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'year', IGNR: 'genre', ICMT: 'comment' };
        if (map[k] && v) info.tags[map[k]] = v;
        p += 8 + n + (n & 1);
      }
    } else if (id === 'data') break;
    o += 8 + size + (size & 1);
  }
}

// --- AIFF -----------------------------------------------------------------
function ext80(u8, o) {
  const exp = ((u8[o] & 0x7f) << 8 | u8[o + 1]) - 16383;
  const hi = be32(u8, o + 2), lo = be32(u8, o + 6);
  return (hi * 2 ** -31 + lo * 2 ** -63) * 2 ** exp;
}
function aiff(u8, info) {
  const aifc = ascii(u8, 8, 4) === 'AIFC';
  info.container = aifc ? 'AIFF-C' : 'AIFF';
  info.codec = 'PCM (big-endian)'; info.lossless = true;
  for (let o = 12; o + 8 <= u8.length;) {
    const id = ascii(u8, o, 4), size = be32(u8, o + 4);
    if (id === 'COMM') {
      info.channels = be16(u8, o + 8);
      info.bitDepth = be16(u8, o + 14);
      info.sampleRate = Math.round(ext80(u8, o + 16));
      if (aifc) {
        const c = ascii(u8, o + 26, 4);
        const names = { NONE: 'PCM (big-endian)', twos: 'PCM (big-endian)', in24: 'PCM 24-bit', in32: 'PCM 32-bit', sowt: 'PCM (little-endian)', fl32: 'PCM float', FL32: 'PCM float', ima4: 'IMA ADPCM', ulaw: 'µ-law', alaw: 'A-law' };
        info.codec = names[c] || c;
        info.lossless = ['NONE', 'twos', 'sowt', 'fl32', 'FL32', 'in24', 'in32'].includes(c);
      }
    } else if (id === 'NAME') info.tags.title = utf8(u8.subarray(o + 8, o + 8 + size));
    else if (id === 'SSND') break;
    o += 8 + size + (size & 1);
  }
}

// --- FLAC -----------------------------------------------------------------
function vorbisComments(u8, o, info) {
  const vlen = le32(u8, o); o += 4 + vlen;
  const count = le32(u8, o); o += 4;
  for (let i = 0; i < count && o < u8.length; i++) {
    const n = le32(u8, o); o += 4;
    const s = utf8(u8.subarray(o, o + n)); o += n;
    const eq = s.indexOf('=');
    if (eq < 0) continue;
    const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1);
    const map = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', DATE: 'year', GENRE: 'genre', COMMENT: 'comment', TRACKNUMBER: 'track' };
    if (map[k] && !info.tags[map[k]]) info.tags[map[k]] = v;
    if (k === 'METADATA_BLOCK_PICTURE') { try { picture(Uint8Array.from(atob(v), c => c.charCodeAt(0)), 0, info); } catch {} }
  }
}
function picture(u8, o, info) {
  o += 4;
  const ml = be32(u8, o); const mime = ascii(u8, o + 4, ml); o += 4 + ml;
  const dl = be32(u8, o); o += 4 + dl + 16;
  const len = be32(u8, o); o += 4;
  if (o + len <= u8.length) info.cover = new Blob([u8.slice(o, o + len)], { type: mime || 'image/jpeg' });
}
function flac(u8, o, info) {
  info.container = info.container || 'FLAC'; info.codec = 'FLAC'; info.lossless = true;
  for (let last = false; !last && o + 4 <= u8.length;) {
    last = !!(u8[o] & 0x80);
    const type = u8[o] & 0x7f, len = (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3];
    const b = o + 4;
    if (type === 0) {
      info.sampleRate = (u8[b + 10] << 12) | (u8[b + 11] << 4) | (u8[b + 12] >> 4);
      info.channels = ((u8[b + 12] >> 1) & 7) + 1;
      info.bitDepth = (((u8[b + 12] & 1) << 4) | (u8[b + 13] >> 4)) + 1;
      const total = (u8[b + 13] & 15) * 2 ** 32 + be32(u8, b + 14);
      if (total && info.sampleRate) info.duration = total / info.sampleRate;
    } else if (type === 4) vorbisComments(u8, b, info);
    else if (type === 6) picture(u8, b, info);
    o = b + len;
  }
}

// --- Ogg (Opus, Vorbis, FLAC) ----------------------------------------------
function oggPackets(u8, max = 3) {
  // Joins page segments into the first few packets.
  const packets = []; let cur = [];
  for (let o = 0; o + 27 <= u8.length && packets.length < max;) {
    if (ascii(u8, o, 4) !== 'OggS') break;
    const nseg = u8[o + 26]; let p = o + 27 + nseg;
    for (let i = 0; i < nseg; i++) {
      const l = u8[o + 27 + i];
      cur.push(u8.subarray(p, p + l)); p += l;
      if (l < 255) { const len = cur.reduce((a, c) => a + c.length, 0); const pk = new Uint8Array(len); let q = 0; for (const c of cur) { pk.set(c, q); q += c.length; } packets.push(pk); cur = []; }
    }
    o = p;
  }
  return packets;
}
function ogg(u8, info) {
  info.container = 'Ogg';
  const [first, second] = oggPackets(u8);
  if (!first) return;
  if (ascii(first, 0, 8) === 'OpusHead') {
    info.codec = 'Opus'; info.channels = first[9]; info.sampleRate = 48000; info.inputRate = le32(first, 12);
    if (second && ascii(second, 0, 8) === 'OpusTags') vorbisComments(second, 8, info);
  } else if (ascii(first, 1, 6) === 'vorbis') {
    info.codec = 'Vorbis'; info.channels = first[11]; info.sampleRate = le32(first, 12);
    const nominal = le32(first, 20); if (nominal > 0 && nominal < 2e6) info.nominalBitrate = nominal;
    if (second && ascii(second, 1, 6) === 'vorbis') vorbisComments(second, 7, info);
  } else if (ascii(first, 1, 4) === 'FLAC') {
    info.codec = 'FLAC'; info.lossless = true;
    flac(first, 13, info); info.container = 'Ogg';
  }
}

// --- CAF ------------------------------------------------------------------
function caf(u8, info) {
  info.container = 'Core Audio (CAF)';
  for (let o = 8; o + 12 <= u8.length;) {
    const id = ascii(u8, o, 4), size = be32(u8, o + 8) * 2 ** 32 + be32(u8, o + 8 + 4);
    if (id === 'desc') {
      const b = o + 12;
      info.sampleRate = Math.round(new DataView(u8.buffer, u8.byteOffset + b, 8).getFloat64(0));
      const fmt = ascii(u8, b + 8, 4);
      info.codec = { lpcm: 'PCM', 'aac ': 'AAC', alac: 'Apple Lossless (ALAC)', ima4: 'IMA ADPCM', '.mp3': 'MP3', opus: 'Opus', ulaw: 'µ-law', alaw: 'A-law' }[fmt] || fmt;
      info.lossless = fmt === 'lpcm' || fmt === 'alac';
      info.channels = be32(u8, b + 24);
      const bits = be32(u8, b + 28); if (bits) info.bitDepth = bits;
      break;
    }
    if (!isFinite(size) || size < 0) break;
    o += 12 + size;
  }
}

// --- MP4 / M4A / MOV ------------------------------------------------------
const BRANDS = { 'M4A ': 'MPEG-4 audio (M4A)', 'M4B ': 'MPEG-4 audiobook (M4B)', 'qt  ': 'QuickTime (MOV)', isom: 'MPEG-4', mp41: 'MPEG-4', mp42: 'MPEG-4', dash: 'MPEG-4 (DASH)', 'M4V ': 'MPEG-4 video' };
const SAMPLE = { mp4a: 'AAC', alac: 'Apple Lossless (ALAC)', Opus: 'Opus', fLaC: 'FLAC', 'ac-3': 'Dolby Digital (AC-3)', 'ec-3': 'Dolby Digital Plus (E-AC-3)', '.mp3': 'MP3', lpcm: 'PCM', sowt: 'PCM', twos: 'PCM', ipcm: 'PCM', fpcm: 'PCM float' };
async function mp4(file, head, info) {
  const brand = ascii(head, 8, 4);
  info.container = BRANDS[brand] || `MPEG-4 (${brand.trim()})`;
  // Find moov — it may sit after mdat at the end of the file.
  let o = 0, moov = null;
  while (o + 8 <= file.size) {
    const h = new Uint8Array(await file.slice(o, o + 16).arrayBuffer());
    let size = be32(h, 0); const type = ascii(h, 4, 4);
    if (size === 1) size = be32(h, 8) * 2 ** 32 + be32(h, 12);
    else if (size === 0) size = file.size - o;
    if (size < 8) break;
    if (type === 'moov') { if (size > 64 << 20) break; moov = new Uint8Array(await file.slice(o, o + size).arrayBuffer()); break; }
    o += size;
  }
  if (!moov) return;
  const kids = (u8, s, e, cb) => { for (let p = s; p + 8 <= e;) { const sz = be32(u8, p); const t = ascii(u8, p + 4, 4); if (sz < 8) break; cb(t, p, p + sz); p += sz; } };
  let videoTrack = false;
  kids(moov, 8, moov.length, (t, s, e) => {
    if (t === 'mvhd') {
      const v = moov[s + 8], ts = v === 1 ? be32(moov, s + 28) : be32(moov, s + 20);
      const dur = v === 1 ? be32(moov, s + 32) * 2 ** 32 + be32(moov, s + 36) : be32(moov, s + 24);
      if (ts) info.duration = dur / ts;
    }
    if (t === 'trak') {
      let handler = '', entry = null;
      const walk = (s2, e2) => kids(moov, s2, e2, (t2, a, b) => {
        if (['mdia', 'minf', 'stbl'].includes(t2)) walk(a + 8, b);
        if (t2 === 'hdlr') handler = ascii(moov, a + 16, 4);
        if (t2 === 'stsd') entry = a + 16;
      });
      walk(s + 8, e);
      if (handler === 'vide') videoTrack = true;
      if (handler === 'soun' && entry && !info.codec) {
        const fmt = ascii(moov, entry + 4, 4);
        info.codec = SAMPLE[fmt] || fmt;
        info.lossless = ['alac', 'fLaC', 'lpcm', 'sowt', 'twos', 'ipcm', 'fpcm'].includes(fmt);
        info.channels = be16(moov, entry + 24);
        info.bitDepth = info.lossless ? be16(moov, entry + 26) : undefined;
        info.sampleRate = be32(moov, entry + 32) >>> 16;
        if (fmt === 'mp4a') {
          // Look for the esds AudioSpecificConfig to tell AAC-LC from HE-AAC.
          for (let p = entry + 36; p < entry + 200 && p < moov.length - 4; p++) {
            if (ascii(moov, p, 4) === 'esds') {
              const end = Math.min(moov.length, p + 120);
              const len = q => { while (q < end && moov[q] & 0x80) q++; return q + 1; };
              for (let q = p + 8; q < end; q++) {
                if (moov[q] === 0x04) {            // DecoderConfigDescriptor
                  const body = len(q + 1), oti = moov[body];
                  if (oti === 0x6b || oti === 0x69) { info.codec = 'MP3'; break; }
                  for (let r = body + 13; r < end; r++) {
                    if (moov[r] !== 0x05) continue; // DecoderSpecificInfo → AudioSpecificConfig
                    const ot = moov[len(r + 1)] >> 3;
                    info.codec = { 1: 'AAC Main', 2: 'AAC-LC', 5: 'HE-AAC', 29: 'HE-AAC v2', 23: 'AAC-LD', 39: 'AAC-ELD' }[ot] || 'AAC';
                    break;
                  }
                  break;
                }
              }
              break;
            }
          }
        }
      }
    }
    if (t === 'udta') mp4Tags(moov, s, e, info, kids);
  });
  if (videoTrack) info.hasVideo = true;
}
function mp4Tags(u8, s, e, info, kids) {
  const map = { '©nam': 'title', '©ART': 'artist', '©alb': 'album', '©day': 'year', '©gen': 'genre', '©cmt': 'comment', aART: 'albumArtist' };
  const find = (s2, e2) => kids(u8, s2, e2, (t, a, b) => {
    if (t === 'meta') find(a + 12, b);
    else if (t === 'ilst') find(a + 8, b);
    else if (map[t] || t === 'covr') {
      kids(u8, a + 8, b, (t2, c, d) => {
        if (t2 !== 'data') return;
        const kind = be32(u8, c + 8) & 0xffffff, body = u8.subarray(c + 16, d);
        if (t === 'covr') info.cover = new Blob([body.slice()], { type: kind === 14 ? 'image/png' : 'image/jpeg' });
        else info.tags[map[t]] = utf8(body);
      });
    }
  });
  find(s + 8, e);
}

// --- Matroska / WebM -------------------------------------------------------
function mkv(u8, info) {
  const s = ascii(u8, 0, Math.min(u8.length, 65536));
  info.container = s.includes('webm') ? 'WebM' : 'Matroska';
  const ids = [['A_OPUS', 'Opus'], ['A_VORBIS', 'Vorbis'], ['A_AAC', 'AAC'], ['A_FLAC', 'FLAC'], ['A_MPEG/L3', 'MP3'], ['A_PCM', 'PCM'], ['A_AC3', 'AC-3']];
  for (const [k, v] of ids) if (s.includes(k)) { info.codec = v; break; }
  if (info.codec === 'Opus') info.sampleRate = 48000;
  if (/V_(VP8|VP9|AV1|MPEG4)/.test(s)) info.hasVideo = true;
  // Audio channels (0x9F) and sampling frequency (0xB5, float) live in the Audio element (0xE1).
  for (let i = 0; i < u8.length - 12; i++) {
    if (u8[i] === 0xb5 && (u8[i + 1] === 0x88 || u8[i + 1] === 0x84)) {
      const dv = new DataView(u8.buffer, u8.byteOffset + i + 2, u8[i + 1] === 0x88 ? 8 : 4);
      const r = u8[i + 1] === 0x88 ? dv.getFloat64(0) : dv.getFloat32(0);
      if (r >= 8000 && r <= 384000 && Number.isInteger(r)) { info.sampleRate = r; }
    }
    if (u8[i] === 0x9f && u8[i + 1] === 0x81 && u8[i + 2] >= 1 && u8[i + 2] <= 8 && info.sampleRate) { info.channels = u8[i + 2]; break; }
  }
}

// --- MP3 / ADTS AAC ----------------------------------------------------------
const MP3_RATE = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const MP3_KBPS = {
  '3-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '3-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '3-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  'x-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  'x-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
function id3(u8, info) {
  const ver = u8[3];
  const size = (u8[6] << 21) | (u8[7] << 14) | (u8[8] << 7) | u8[9];
  info.tagFormat = `ID3v2.${ver}`;
  const end = Math.min(u8.length, 10 + size);
  const text = b => {
    const enc = b[0], body = b.subarray(1);
    if (enc === 1 || enc === 2) return new TextDecoder(enc === 2 ? 'utf-16be' : 'utf-16').decode(body).replace(/\0+$/, '');
    return enc === 3 ? utf8(body) : new TextDecoder('latin1').decode(body).replace(/\0+$/, '');
  };
  const map = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year', TCON: 'genre', TRCK: 'track', TT2: 'title', TP1: 'artist', TAL: 'album', TYE: 'year' };
  for (let o = 10; o + 10 <= end;) {
    const v2 = ver === 2;
    const id = ascii(u8, o, v2 ? 3 : 4);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const len = v2 ? (u8[o + 3] << 16) | (u8[o + 4] << 8) | u8[o + 5]
      : ver === 4 ? (u8[o + 4] << 21) | (u8[o + 5] << 14) | (u8[o + 6] << 7) | u8[o + 7] : be32(u8, o + 4);
    const b = u8.subarray(o + (v2 ? 6 : 10), o + (v2 ? 6 : 10) + len);
    if (map[id]) info.tags[map[id]] = text(b);
    if (id === 'APIC' && !info.cover) {
      let p = 1; const enc = b[0];
      const mEnd = b.indexOf(0, p); const mime = ascii(b, p, mEnd - p); p = mEnd + 2;
      if (enc === 1 || enc === 2) { while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2; p += 2; } else { while (p < b.length && b[p] !== 0) p++; p++; }
      info.cover = new Blob([b.slice(p)], { type: mime.includes('/') ? mime : 'image/jpeg' });
    }
    o += (v2 ? 6 : 10) + len;
  }
  return 10 + size + (u8[5] & 0x10 ? 10 : 0);
}
function mpeg(u8, info) {
  let o = 0;
  if (ascii(u8, 0, 3) === 'ID3') o = id3(u8, info);
  for (; o < u8.length - 4; o++) if (u8[o] === 0xff && (u8[o + 1] & 0xe0) === 0xe0) break;
  if (o >= u8.length - 4) return;
  const b1 = u8[o + 1], b2 = u8[o + 2], b3 = u8[o + 3];
  const layerBits = (b1 >> 1) & 3;
  if (layerBits === 0) { // ADTS AAC
    info.container = 'ADTS'; info.codec = 'AAC' + (((b2 >> 6) + 1) === 2 ? '-LC' : ((b2 >> 6) + 1) === 5 ? ' (HE)' : '');
    info.sampleRate = AAC_RATES[(b2 >> 2) & 15];
    info.channels = ((b2 & 1) << 2) | (b3 >> 6);
    return;
  }
  const ver = (b1 >> 3) & 3, layer = 4 - layerBits;
  info.container = info.tagFormat ? `MPEG audio + ${info.tagFormat}` : 'MPEG audio';
  info.codec = `MP${layer}` + (ver === 3 ? '' : ver === 2 ? ' (MPEG-2)' : ' (MPEG-2.5)');
  info.sampleRate = MP3_RATE[ver]?.[(b2 >> 2) & 3];
  const mode = b3 >> 6;
  info.channels = mode === 3 ? 1 : 2;
  info.channelMode = ['Stereo', 'Joint stereo', 'Dual channel', 'Mono'][mode];
  const kbps = MP3_KBPS[(ver === 3 ? '3-' : 'x-') + (ver === 3 ? layer : layer === 1 ? 1 : 2)]?.[b2 >> 4];
  // Xing / Info / VBRI header says VBR and gives the frame count.
  const side = ver === 3 ? (mode === 3 ? 17 : 32) : (mode === 3 ? 9 : 17);
  const x = o + 4 + side, tag = ascii(u8, x, 4);
  if (tag === 'Xing' || tag === 'Info') {
    info.vbr = tag === 'Xing';
    const flags = be32(u8, x + 4);
    if (flags & 1) { const frames = be32(u8, x + 8); const spf = layer === 1 ? 384 : ver === 3 || layer === 2 ? 1152 : 576; if (info.sampleRate) info.duration = frames * spf / info.sampleRate; }
  } else if (ascii(u8, o + 36, 4) === 'VBRI') info.vbr = true;
  if (!info.vbr && kbps) info.nominalBitrate = kbps * 1000;
}
