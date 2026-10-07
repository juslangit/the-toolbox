// Subtitle files (SRT and WebVTT) and SMPTE timecode maths.

// --- subtitles -------------------------------------------------------------
const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/;
export function parseTime(s) {
  const m = String(s).trim().match(TIME);
  if (!m) return NaN;
  return ((+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000 + (+(m[4] || '0').padEnd(3, '0'));
}

// Returns { cues: [{ start, end, text, id?, settings? }], format: 'srt'|'vtt' } — times in ms.
export function parseSubs(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const format = /^WEBVTT/.test(src.trimStart()) ? 'vtt' : 'srt';
  const cues = [];
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0 || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const [a, rest] = lines[at].split('-->');
    const bm = rest.trim().match(/^(\S+)\s*(.*)$/);
    const start = parseTime(a), end = parseTime(bm?.[1] || '');
    if (!isFinite(start) || !isFinite(end)) continue;
    const id = at > 0 ? lines.slice(0, at).join(' ').trim() : '';
    cues.push({ start, end, text: lines.slice(at + 1).join('\n'), id: /^\d+$/.test(id) ? '' : id, settings: bm?.[2] || '' });
  }
  return { cues, format };
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
export function fmtSubTime(ms, sep = ',') {
  ms = Math.max(0, Math.round(ms));
  return `${pad(ms / 3600000)}:${pad(ms / 60000 % 60)}:${pad(ms / 1000 % 60)}${sep}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${fmtSubTime(c.start)} --> ${fmtSubTime(c.end)}\n${c.text.replace(/<\/?c[^>]*>|<\d\d:[^>]*>/g, '')}`).join('\n\n') + '\n';
}
export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map(c => `${c.id ? c.id + '\n' : ''}${fmtSubTime(c.start, '.')} --> ${fmtSubTime(c.end, '.')}${c.settings ? ' ' + c.settings : ''}\n${c.text}`).join('\n\n') + '\n';
}

// Shift, rescale and tidy. Returns { cues, dropped, fixed }.
export function adjustSubs(cues, { shift = 0, from = 0, to = 0, fixOverlaps = false, gap = 0 } = {}) {
  const k = from && to ? from / to : 1;
  let out = cues.map(c => ({ ...c, start: Math.round(c.start * k + shift), end: Math.round(c.end * k + shift) }));
  const before = out.length;
  out = out.filter(c => c.end > 0).map(c => ({ ...c, start: Math.max(0, c.start) }));
  let fixed = 0;
  if (fixOverlaps) {
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i < out.length - 1; i++) {
      const lim = out[i + 1].start - gap;
      if (out[i].end > lim) { out[i].end = Math.max(out[i].start + 1, lim); fixed++; }
    }
  }
  return { cues: out, dropped: before - out.length, fixed };
}

export const countOverlaps = cues => {
  let n = 0;
  const s = [...cues].sort((a, b) => a.start - b.start);
  for (let i = 0; i < s.length - 1; i++) if (s[i].end > s[i + 1].start) n++;
  return n;
};

// --- timecode --------------------------------------------------------------
// fps is the real rate; nominal is the frame count per timecode second.
export const RATES = [
  { id: '23.976', label: '23.976', fps: 24000 / 1001, nominal: 24, df: false },
  { id: '24', label: '24', fps: 24, nominal: 24, df: false },
  { id: '25', label: '25 (PAL)', fps: 25, nominal: 25, df: false },
  { id: '29.97df', label: '29.97 drop-frame', fps: 30000 / 1001, nominal: 30, df: true },
  { id: '29.97', label: '29.97 non-drop', fps: 30000 / 1001, nominal: 30, df: false },
  { id: '30', label: '30', fps: 30, nominal: 30, df: false },
  { id: '48', label: '48', fps: 48, nominal: 48, df: false },
  { id: '50', label: '50', fps: 50, nominal: 50, df: false },
  { id: '59.94df', label: '59.94 drop-frame', fps: 60000 / 1001, nominal: 60, df: true },
  { id: '59.94', label: '59.94 non-drop', fps: 60000 / 1001, nominal: 60, df: false },
  { id: '60', label: '60', fps: 60, nominal: 60, df: false },
];
export const rate = id => RATES.find(r => r.id === id) || RATES[2];

// "01:02:03:04" / "01:02:03;04" → frame count (NaN if not a timecode, or frames out of range).
export function tcToFrames(tc, r) {
  const m = String(tc).trim().match(/^(-)?(\d{1,3})[:;.](\d{1,2})[:;.](\d{1,2})[:;.,](\d{1,3})$/);
  if (!m) return NaN;
  const [hh, mm, ss, ff] = [m[2], m[3], m[4], m[5]].map(Number);
  if (mm > 59 || ss > 59 || ff >= r.nominal) return NaN;
  let f = (hh * 3600 + mm * 60 + ss) * r.nominal + ff;
  if (r.df) {
    const drop = r.nominal / 15, mins = hh * 60 + mm;     // 2 at 29.97, 4 at 59.94
    if (ss === 0 && ff < drop && mm % 10 !== 0) return NaN; // those numbers don't exist in drop-frame
    f -= drop * (mins - Math.floor(mins / 10));
  }
  return m[1] ? -f : f;
}

export function framesToTc(frames, r) {
  const neg = frames < 0;
  let f = Math.abs(Math.round(frames));
  if (r.df) {
    const drop = r.nominal / 15;
    const per10 = r.nominal * 600 - drop * 9, perMin = r.nominal * 60 - drop;
    const d = Math.floor(f / per10), m = f % per10;
    f += drop * 9 * d + (m > drop ? drop * Math.floor((m - drop) / perMin) : 0);
  }
  const n = r.nominal;
  const ff = f % n, s = Math.floor(f / n);
  const sep = r.df ? ';' : ':';
  return `${neg ? '-' : ''}${pad(s / 3600)}:${pad(s / 60 % 60)}:${pad(s % 60)}${sep}${pad(ff, String(n - 1).length)}`;
}
