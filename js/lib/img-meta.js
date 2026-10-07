// Picture metadata: read EXIF/GPS from JPEG, PNG, WebP, HEIC/AVIF, list every
// metadata block a file carries, and strip them without re-compressing.
// Written from the TIFF/EXIF 2.3, PNG and RIFF/WebP specs.

const TAGS = {
  0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution',
  0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist',
  0x8298: 'Copyright', 0x8769: 'ExifIFD', 0x8825: 'GPSIFD', 0xa005: 'InteropIFD',
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9201: 'ShutterSpeedValue',
  0x9202: 'ApertureValue', 0x9204: 'ExposureBias', 0x9207: 'MeteringMode', 0x9209: 'Flash', 0x920a: 'FocalLength',
  0x927c: 'MakerNote', 0x9286: 'UserComment', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension',
  0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa405: 'FocalLengthIn35mm', 0xa406: 'SceneCaptureType',
  0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification', 0xa433: 'LensMake',
  0xa434: 'LensModel', 0xa435: 'LensSerialNumber', 0xa420: 'ImageUniqueID',
};
const GPS_TAGS = {
  0: 'GPSVersionID', 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude',
  5: 'GPSAltitudeRef', 6: 'GPSAltitude', 7: 'GPSTimeStamp', 12: 'GPSSpeedRef', 13: 'GPSSpeed',
  16: 'GPSImgDirectionRef', 17: 'GPSImgDirection', 29: 'GPSDateStamp',
};
const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

// Reads a TIFF block (the body of an EXIF segment). Returns a flat { Tag: value }.
export function readTiff(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.byteLength < 8) return {};
  const le = v.getUint16(0) === 0x4949;
  if (!le && v.getUint16(0) !== 0x4d4d) return {};
  const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const out = {};
  const seen = new Set();
  function ifd(off, names) {
    if (!off || off + 2 > v.byteLength || seen.has(off)) return;
    seen.add(off);
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const size = (SIZES[type] || 1) * count;
      const at = size > 4 ? u32(e + 8) : e + 8;
      if (at + size > v.byteLength) continue;
      const name = names[tag];
      if (!name) continue;
      let val;
      if (type === 2) val = new TextDecoder().decode(bytes.subarray(at, at + count)).replace(/\0+$/, '').trim();
      else if (type === 3) val = Array.from({ length: count }, (_, k) => u16(at + k * 2));
      else if (type === 4) val = Array.from({ length: count }, (_, k) => u32(at + k * 4));
      else if (type === 9) val = Array.from({ length: count }, (_, k) => v.getInt32(at + k * 4, le));
      else if (type === 5 || type === 10) val = Array.from({ length: count }, (_, k) => {
        const a = type === 5 ? u32(at + k * 8) : v.getInt32(at + k * 8, le), b = type === 5 ? u32(at + k * 8 + 4) : v.getInt32(at + k * 8 + 4, le);
        return b ? a / b : 0;
      });
      else if (type === 1 || type === 7) val = bytes.subarray(at, at + count);
      else continue;
      if (Array.isArray(val) && val.length === 1) val = val[0];
      if (name === 'ExifIFD' || name === 'InteropIFD') ifd(val, TAGS);
      else if (name === 'GPSIFD') ifd(val, GPS_TAGS);
      else out[name] = val;
    }
  }
  ifd(u32(4), TAGS);
  return out;
}

// Decimal degrees from the GPS block, or null.
export function gpsOf(t) {
  if (!Array.isArray(t.GPSLatitude) || !Array.isArray(t.GPSLongitude)) return null;
  const deg = a => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
  let lat = deg(t.GPSLatitude), lon = deg(t.GPSLongitude);
  if (/S/i.test(t.GPSLatitudeRef || '')) lat = -lat;
  if (/W/i.test(t.GPSLongitudeRef || '')) lon = -lon;
  if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return null;
  const alt = typeof t.GPSAltitude === 'number' ? (t.GPSAltitudeRef?.[0] === 1 ? -t.GPSAltitude : t.GPSAltitude) : null;
  return { lat, lon, alt };
}

const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const find = (b, pat, from = 0, to = b.length) => {
  outer: for (let i = from; i <= to - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer; return i; }
  return -1;
};
const EXIF_HDR = [0x45, 0x78, 0x69, 0x66, 0, 0];

export function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 3) === 'GIF') return 'gif';
  if (ascii(b, 4, 4) === 'ftyp') { const brand = ascii(b, 8, 4); return /avi[fs]/.test(brand) ? 'avif' : 'heic'; }
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return 'tiff';
  if (/<svg|<\?xml/.test(ascii(b, 0, Math.min(200, b.length)))) return 'svg';
  return 'unknown';
}

// --- JPEG segments -------------------------------------------------------------------
function jpegSegments(b) {
  const segs = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    segs.push({ marker: m, start: i, end: i + 2 + len, data: b.subarray(i + 4, i + 2 + len) });
    if (m === 0xda) break; // image data follows
    i += 2 + len;
  }
  return segs;
}
function describeJpegSeg(s) {
  const d = s.data, m = s.marker;
  if (m === 0xe1 && find(d, EXIF_HDR, 0, 6) === 0) return { kind: 'exif', name: 'EXIF (camera, date, maybe GPS)' };
  if (m === 0xe1 && ascii(d, 0, 28).startsWith('http://ns.adobe.com/xap/1.0/')) return { kind: 'xmp', name: 'XMP (editing history, ratings, maybe location)' };
  if (m === 0xe1) return { kind: 'other', name: 'APP1 extra data' };
  if (m === 0xe0) return { kind: ascii(d, 0, 4) === 'JFIF' ? 'keep' : 'other', name: 'JFIF header (harmless)' };
  if (m === 0xe2 && ascii(d, 0, 11) === 'ICC_PROFILE') return { kind: 'icc', name: 'Colour profile (kept — it sets how colours look)' };
  if (m === 0xe2 && ascii(d, 0, 3) === 'MPF') return { kind: 'other', name: 'Multi-picture index (extra embedded images)' };
  if (m === 0xed) return { kind: 'iptc', name: 'IPTC / Photoshop (captions, author, keywords)' };
  if (m === 0xee && ascii(d, 0, 5) === 'Adobe') return { kind: 'keep', name: 'Adobe colour flag (needed to show colours)' };
  if (m === 0xfe) return { kind: 'comment', name: 'Comment' };
  if (m >= 0xe0 && m <= 0xef) return { kind: 'other', name: `APP${m - 0xe0} block` };
  return null;
}

// --- PNG chunks ----------------------------------------------------------------------
function pngChunks(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = v.getUint32(i), type = ascii(b, i + 4, 4);
    out.push({ type, start: i, end: i + 12 + len, data: b.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'iCCP', 'sRGB', 'gAMA', 'cHRM', 'sBIT', 'pHYs', 'bKGD', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI']);
function pngText(c) {
  const d = c.data, z = d.indexOf(0);
  const key = ascii(d, 0, z);
  if (c.type === 'tEXt') return [key, new TextDecoder('latin1').decode(d.subarray(z + 1))];
  if (c.type === 'iTXt' && d[z + 1] === 0) {
    let p = z + 3; p = d.indexOf(0, p) + 1; p = d.indexOf(0, p) + 1;
    return [key, new TextDecoder().decode(d.subarray(p))];
  }
  return [key, '(compressed text)'];
}

// --- WebP chunks ---------------------------------------------------------------------
function webpChunks(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4), len = v.getUint32(i + 4, true);
    const end = i + 8 + len + (len & 1);
    out.push({ type, start: i, end: Math.min(end, b.length), data: b.subarray(i + 8, i + 8 + len) });
    i = end;
  }
  return out;
}

// Everything we can tell about the metadata in a file.
// → { format, tags, gps, blocks: [{ name, size, kind }], text: [[key, value]] }
export function inspect(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = sniff(b);
  const blocks = [], text = [];
  let tags = {};
  const exifFrom = tiff => { tags = { ...tags, ...readTiff(tiff) }; };
  if (format === 'jpeg') {
    for (const s of jpegSegments(b)) {
      const d = describeJpegSeg(s);
      if (!d) continue;
      blocks.push({ ...d, size: s.end - s.start });
      if (d.kind === 'exif') exifFrom(s.data.subarray(6));
      if (d.kind === 'comment') text.push(['Comment', new TextDecoder().decode(s.data)]);
      if (d.kind === 'xmp') xmpFacts(s.data, text);
    }
    const sos = jpegSegments(b).find(s => s.marker === 0xda);
    if (sos) {
      const eoi = endOfJpeg(b, sos.end);
      if (eoi > 0 && b.length - eoi > 64) blocks.push({ kind: 'other', name: 'Extra data after the picture (e.g. a second image or maker data)', size: b.length - eoi });
    }
  } else if (format === 'png') {
    for (const c of pngChunks(b)) {
      if (PNG_KEEP.has(c.type)) { if (c.type === 'iCCP') blocks.push({ kind: 'icc', name: 'Colour profile (kept)', size: c.end - c.start }); continue; }
      if (c.type === 'eXIf') { blocks.push({ kind: 'exif', name: 'EXIF', size: c.end - c.start }); exifFrom(c.data); continue; }
      if (/^[tiz]TXt$/.test(c.type)) {
        const [k, val] = pngText(c);
        if (k === 'XML:com.adobe.xmp') { blocks.push({ kind: 'xmp', name: 'XMP', size: c.end - c.start }); xmpFacts(new TextEncoder().encode(val), text); }
        else { blocks.push({ kind: 'text', name: `Text: ${k}`, size: c.end - c.start }); text.push([k, val.slice(0, 300)]); }
        continue;
      }
      blocks.push({ kind: 'other', name: c.type === 'tIME' ? 'Last-edited time' : `${c.type} chunk`, size: c.end - c.start });
    }
  } else if (format === 'webp') {
    for (const c of webpChunks(b)) {
      if (c.type === 'EXIF') { blocks.push({ kind: 'exif', name: 'EXIF', size: c.end - c.start }); exifFrom(find(c.data, EXIF_HDR, 0, 6) === 0 ? c.data.subarray(6) : c.data); }
      else if (c.type === 'XMP ') { blocks.push({ kind: 'xmp', name: 'XMP', size: c.end - c.start }); xmpFacts(c.data, text); }
      else if (c.type === 'ICCP') blocks.push({ kind: 'icc', name: 'Colour profile (kept)', size: c.end - c.start });
    }
  } else if (format === 'gif') {
    for (const e of gifExtensions(b)) if (e.kind !== 'keep') blocks.push(e);
  } else {
    // HEIC / AVIF / TIFF: look for an EXIF block anywhere.
    const at = find(b, EXIF_HDR);
    if (at >= 0) { exifFrom(b.subarray(at + 6)); blocks.push({ kind: 'exif', name: 'EXIF', size: 0 }); }
    else if (format === 'tiff') exifFrom(b);
    const x = find(b, [...new TextEncoder().encode('<x:xmpmeta')]);
    if (x >= 0) { blocks.push({ kind: 'xmp', name: 'XMP', size: 0 }); xmpFacts(b.subarray(x, x + 20000), text); }
  }
  delete tags.MakerNote;
  return { format, tags, gps: gpsOf(tags), blocks, text };
}

function xmpFacts(d, text) {
  const s = new TextDecoder().decode(d.subarray(0, 60000));
  for (const [k, label] of [['xmp:CreatorTool', 'Made with'], ['photoshop:City', 'City'], ['Iptc4xmpCore:Location', 'Location'], ['xmp:Rating', 'Rating']]) {
    const m = s.match(new RegExp(`${k}(?:="([^"]*)"|>([^<]*)<)`));
    if (m) text.push([label, (m[1] ?? m[2]).trim()]);
  }
}

function endOfJpeg(b, from) {
  for (let i = from; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xd9) return i + 2;
  return -1;
}

function gifExtensions(b) {
  const out = [];
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
  const skipSubs = j => { while (j < b.length && b[j]) j += b[j] + 1; return j + 1; };
  while (i < b.length) {
    const t = b[i];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[i + 1], start = i;
      let name = null, kind = 'keep';
      if (label === 0xfe) { kind = 'comment'; name = 'Comment'; }
      else if (label === 0xff) {
        const app = ascii(b, i + 3, 11);
        if (!/^NETSCAPE2\.0|^ANIMEXTS1\.0/.test(app)) { kind = /XMP/.test(app) ? 'xmp' : 'other'; name = /XMP/.test(app) ? 'XMP' : `App data (${app.trim()})`; }
      }
      const end = skipSubs(i + 2);
      out.push({ kind, name, start, end, size: end - start });
      i = end;
    } else if (t === 0x2c) {
      let j = i + 10;
      if (b[i + 9] & 0x80) j += 3 * (1 << ((b[i + 9] & 7) + 1));
      out.push({ kind: 'keep', start: i, end: skipSubs(j + 1) });
      i = skipSubs(j + 1);
    } else break;
  }
  return out;
}

// --- building EXIF (for keeping the rotation, and for tests) ------------------------
// fields: { Make, Model, Software, DateTimeOriginal, Orientation, GPSLatitude: deg, GPSLongitude: deg }
export function buildExif(fields) {
  const ifd0 = [], exif = [], gps = [];
  const ascii0 = s => [...new TextEncoder().encode(s), 0];
  if (fields.Make) ifd0.push([0x010f, 2, ascii0(fields.Make)]);
  if (fields.Model) ifd0.push([0x0110, 2, ascii0(fields.Model)]);
  if (fields.Orientation) ifd0.push([0x0112, 3, [fields.Orientation]]);
  if (fields.Software) ifd0.push([0x0131, 2, ascii0(fields.Software)]);
  if (fields.DateTimeOriginal) exif.push([0x9003, 2, ascii0(fields.DateTimeOriginal)]);
  if (fields.LensModel) exif.push([0xa434, 2, ascii0(fields.LensModel)]);
  if (fields.GPSLatitude != null) {
    const dms = d => { d = Math.abs(d); const D = Math.floor(d), M = Math.floor((d - D) * 60), S = Math.round(((d - D) * 60 - M) * 60 * 10000); return [[D, 1], [M, 1], [S, 10000]]; };
    gps.push([1, 2, ascii0(fields.GPSLatitude < 0 ? 'S' : 'N')], [2, 5, dms(fields.GPSLatitude)],
      [3, 2, ascii0(fields.GPSLongitude < 0 ? 'W' : 'E')], [4, 5, dms(fields.GPSLongitude)]);
  }
  if (exif.length) ifd0.push([0x8769, 4, [0]]);
  if (gps.length) ifd0.push([0x8825, 4, [0]]);
  // Layout: header(8) | IFD0 | exif IFD | gps IFD | data
  const ifdSize = list => 2 + list.length * 12 + 4;
  const tables = [ifd0, exif, gps].filter(l => l.length);
  let dataAt = 8 + tables.reduce((s, l) => s + ifdSize(l), 0);
  const buf = new Uint8Array(dataAt + 4096), v = new DataView(buf.buffer);
  buf.set([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]);
  let at = 8;
  const offsets = [];
  for (const l of tables) { offsets.push(at); at += ifdSize(l); }
  if (exif.length) ifd0.find(e => e[0] === 0x8769)[2] = [offsets[tables.indexOf(exif)]];
  if (gps.length) ifd0.find(e => e[0] === 0x8825)[2] = [offsets[tables.indexOf(gps)]];
  tables.forEach((l, ti) => {
    let o = offsets[ti];
    l.sort((a, b) => a[0] - b[0]);
    v.setUint16(o, l.length); o += 2;
    for (const [tag, type, vals] of l) {
      v.setUint16(o, tag); v.setUint16(o + 2, type);
      const count = type === 2 ? vals.length : vals.length;
      v.setUint32(o + 4, count);
      const size = SIZES[type] * count;
      let w = size > 4 ? dataAt : o + 8;
      if (size > 4) { v.setUint32(o + 8, dataAt); dataAt += size + (size & 1); }
      for (const x of vals) {
        if (type === 2 || type === 1) v.setUint8(w++, x);
        else if (type === 3) { v.setUint16(w, x); w += 2; }
        else if (type === 4) { v.setUint32(w, x); w += 4; }
        else if (type === 5) { v.setUint32(w, x[0]); v.setUint32(w + 4, x[1]); w += 8; }
      }
      o += 12;
    }
    v.setUint32(o, 0);
  });
  return buf.slice(0, dataAt);
}

// Puts an EXIF block into a JPEG (right after the JFIF header if there is one).
export function insertExif(jpeg, tiff) {
  const len = tiff.length + 8;
  const seg = new Uint8Array(len + 2);
  seg.set([0xff, 0xe1, len >> 8, len & 255, ...EXIF_HDR]);
  seg.set(tiff, 10);
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, at)); out.set(seg, at); out.set(jpeg.subarray(at), at + seg.length);
  return out;
}

// --- stripping -----------------------------------------------------------------------
// Removes metadata without touching the pixels. Returns the new bytes, or null if
// this format can't be cleaned in place (the caller re-saves it instead).
// The colour profile is kept, and so is the rotation (as a tiny EXIF with only that).
export function strip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = sniff(b);
  if (format === 'jpeg') {
    const segs = jpegSegments(b);
    const sos = segs.find(s => s.marker === 0xda);
    if (!sos) return null;
    let orientation = 1;
    const parts = [b.subarray(0, 2)];
    for (const s of segs) {
      if (s === sos) break;
      const d = describeJpegSeg(s);
      if (d?.kind === 'exif') { const o = readTiff(s.data.subarray(6)).Orientation; if (o > 1 && o <= 8) orientation = o; }
      if (d && d.kind !== 'keep' && d.kind !== 'icc') continue;
      parts.push(b.subarray(s.start, s.end));
    }
    const eoi = endOfJpeg(b, sos.end);
    parts.push(b.subarray(sos.start, eoi > 0 ? eoi : b.length));
    let out = concat(parts);
    if (orientation !== 1) out = insertExif(out, buildExif({ Orientation: orientation }));
    return out;
  }
  if (format === 'png') {
    return concat([b.subarray(0, 8), ...pngChunks(b).filter(c => PNG_KEEP.has(c.type)).map(c => b.subarray(c.start, c.end))]);
  }
  if (format === 'webp') {
    const chunks = webpChunks(b).filter(c => c.type !== 'EXIF' && c.type !== 'XMP ');
    const body = concat([new TextEncoder().encode('WEBP'), ...chunks.map(c => b.subarray(c.start, c.end))]);
    const out = concat([new TextEncoder().encode('RIFF'), new Uint8Array(4), body]);
    new DataView(out.buffer).setUint32(4, body.length, true);
    const vp8x = find(out, [...new TextEncoder().encode('VP8X')], 12, 16);
    if (vp8x === 12) out[20] &= ~0x0c; // clear the EXIF and XMP flags
    return out;
  }
  if (format === 'gif') {
    const ext = gifExtensions(b);
    const drop = ext.filter(e => e.kind !== 'keep');
    if (!drop.length) return b;
    const parts = []; let at = 0;
    for (const e of drop) { parts.push(b.subarray(at, e.start)); at = e.end; }
    parts.push(b.subarray(at));
    return concat(parts);
  }
  return null;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Plain-English lines for the main EXIF facts.
export function summary(t) {
  const out = [];
  const cam = [t.Make, t.Model && !String(t.Model).startsWith(t.Make || '\0') ? t.Model : t.Model].filter(Boolean);
  const camera = t.Make && t.Model && String(t.Model).toLowerCase().startsWith(String(t.Make).toLowerCase()) ? t.Model : cam.join(' ');
  if (camera) out.push(['Camera', camera]);
  const lens = t.LensModel || (t.LensMake ? t.LensMake : null);
  if (lens) out.push(['Lens', lens]);
  const when = t.DateTimeOriginal || t.DateTime;
  if (when) out.push(['Taken', String(when).replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3') + (t.OffsetTimeOriginal ? ' ' + t.OffsetTimeOriginal : '')]);
  const exp = [];
  if (t.ExposureTime) exp.push(t.ExposureTime >= 1 ? `${+t.ExposureTime.toFixed(1)} s` : `1/${Math.round(1 / t.ExposureTime)} s`);
  if (t.FNumber) exp.push(`f/${+t.FNumber.toFixed(1)}`);
  if (t.ISO) exp.push(`ISO ${Array.isArray(t.ISO) ? t.ISO[0] : t.ISO}`);
  if (t.FocalLength) exp.push(`${+t.FocalLength.toFixed(1)} mm` + (t.FocalLengthIn35mm ? ` (${t.FocalLengthIn35mm} mm full-frame)` : ''));
  if (exp.length) out.push(['Exposure', exp.join(' · ')]);
  if (t.Flash != null) out.push(['Flash', t.Flash & 1 ? 'Fired' : 'Did not fire']);
  if (t.Orientation > 1) out.push(['Rotation flag', { 2: 'Mirrored', 3: 'Upside down', 4: 'Flipped', 5: 'Mirrored + 90°', 6: 'Turned 90° right', 7: 'Mirrored + 90° left', 8: 'Turned 90° left' }[t.Orientation] || t.Orientation]);
  if (t.Software) out.push(['Software', t.Software]);
  for (const k of ['Artist', 'Copyright', 'ImageDescription', 'CameraOwnerName', 'BodySerialNumber', 'LensSerialNumber']) {
    if (t[k] && typeof t[k] === 'string') out.push([{ Artist: 'Artist', Copyright: 'Copyright', ImageDescription: 'Description', CameraOwnerName: 'Owner', BodySerialNumber: 'Camera serial', LensSerialNumber: 'Lens serial' }[k], t[k]]);
  }
  return out;
}
