// SRT / WebVTT reading and drawing subtitles onto a canvas (the same drawing
// is used for the live preview and for the burned-in export, so they match).

const stamp = s => {
  const m = s.trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return NaN;
  return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +('0.' + m[4].padEnd(3, '0')) : 0);
};

// → [{ start, end, text }] sorted by start. Takes SRT or VTT.
export function parseSubs(src) {
  const text = String(src).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = stamp(a), end = stamp(b.trim().split(/\s+/)[0]);
    if (!isFinite(start) || !isFinite(end) || end <= start) continue;
    const body = lines.slice(at + 1).join('\n')
      .replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export const cueAt = (cues, t) => cues.filter(c => t >= c.start && t < c.end);

export const DEFAULT_STYLE = { size: 6, colour: '#ffffff', edge: '#000000', look: 'outline', position: 'bottom', margin: 6, font: 'sans-serif' };

// Wraps text to fit maxW, keeping the author's line breaks.
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? line + ' ' + word : word;
      if (ctx.measureText(tryLine).width > maxW && line) { out.push(line); line = word; }
      else line = tryLine;
    }
    if (line) out.push(line);
  }
  return out;
}

// Draws the cues showing at time t. size and margin are % of the picture height.
export function drawSubs(ctx, cues, t, W, H, style = DEFAULT_STYLE) {
  const now = cueAt(cues, t);
  if (!now.length) return;
  const s = { ...DEFAULT_STYLE, ...style };
  const px = Math.max(10, Math.round(H * s.size / 100));
  ctx.save();
  ctx.font = `600 ${px}px ${s.font === 'serif' ? 'Georgia, serif' : s.font === 'mono' ? 'ui-monospace, monospace' : 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lines = now.flatMap(c => wrap(ctx, c.text, W * 0.9));
  const lh = px * 1.25;
  const block = lines.length * lh;
  const margin = H * s.margin / 100;
  let y = s.position === 'top' ? margin + lh / 2 : s.position === 'middle' ? H / 2 - block / 2 + lh / 2 : H - margin - block + lh / 2;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (s.look === 'box') {
      ctx.fillStyle = hexA(s.edge, 0.72);
      const pad = px * 0.3;
      ctx.fillRect(W / 2 - w / 2 - pad, y - lh / 2, w + pad * 2, lh);
    } else if (s.look === 'outline') {
      ctx.strokeStyle = s.edge;
      ctx.lineWidth = Math.max(2, px * 0.16);
      ctx.strokeText(line, W / 2, y);
    } else if (s.look === 'shadow') {
      ctx.shadowColor = s.edge; ctx.shadowBlur = px * 0.25; ctx.shadowOffsetY = px * 0.06;
    }
    ctx.fillStyle = s.colour;
    ctx.fillText(line, W / 2, y);
    ctx.shadowColor = 'transparent';
    y += lh;
  }
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
