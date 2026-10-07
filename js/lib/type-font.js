// Reading font files for the Font file explorer. opentype.js (MIT) parses
// TTF, OTF and WOFF; WOFF2 is first unpacked in a worker (type-woff2-worker.js).

export function formatOf(buf) {
  const sig = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 4));
  if (sig === 'wOF2') return 'WOFF2';
  if (sig === 'wOFF') return 'WOFF';
  if (sig === 'OTTO') return 'OpenType (CFF)';
  if (sig === 'true' || sig === '\0\x01\0\0') return 'TrueType';
  if (sig === 'ttcf') return 'Font collection';
  return null;
}

function unwoff2(buf) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./type-woff2-worker.js', import.meta.url));
    w.onmessage = e => { w.terminate(); e.data.ok ? resolve(e.data.buf) : reject(new Error(e.data.error)); };
    w.onerror = e => { w.terminate(); reject(new Error(e.message || 'The WOFF2 decoder failed to start')); };
    w.postMessage(buf.slice(0));
  });
}

export async function readFont(file) {
  const buf = await file.arrayBuffer();
  const format = formatOf(buf);
  if (!format) throw new Error('This does not look like a font file (TTF, OTF, WOFF or WOFF2).');
  if (format === 'Font collection') throw new Error('Font collections (.ttc) are not supported — open one of the fonts inside it instead.');
  const opentype = await import('../../vendor/opentype.js');
  const sfnt = format === 'WOFF2' ? await unwoff2(buf) : buf;
  const font = opentype.parse(sfnt);
  return { font, buf, format };
}

// English name from the name table, whichever opentype.js layout is in use.
export function nameOf(font, key) {
  try { const v = font.getEnglishName?.(key); if (v) return v; } catch {}
  const n = font.names?.[key] || font.names?.windows?.[key] || font.names?.unicode?.[key] || font.names?.macintosh?.[key];
  if (!n) return '';
  return n.en || Object.values(n)[0] || '';
}

export const FEATURES = {
  aalt: 'Access all alternates', abvs: 'Above-base substitutions', afrc: 'Alternative fractions', blwf: 'Below-base forms',
  c2sc: 'Capitals to small caps', calt: 'Contextual alternates', case: 'Case-sensitive forms', ccmp: 'Glyph composition',
  clig: 'Contextual ligatures', cpsp: 'Capital spacing', cv01: 'Character variant 1', dlig: 'Discretionary ligatures',
  dnom: 'Denominators', fina: 'Final forms', frac: 'Fractions', init: 'Initial forms', isol: 'Isolated forms', kern: 'Kerning',
  liga: 'Standard ligatures', lnum: 'Lining figures', locl: 'Localised forms', mark: 'Mark positioning', medi: 'Medial forms',
  mkmk: 'Mark-to-mark positioning', numr: 'Numerators', onum: 'Old-style figures', ordn: 'Ordinals', pnum: 'Proportional figures',
  rlig: 'Required ligatures', salt: 'Stylistic alternates', sinf: 'Scientific inferiors', smcp: 'Small caps', subs: 'Subscript',
  sups: 'Superscript', swsh: 'Swash', titl: 'Titling', tnum: 'Tabular figures', zero: 'Slashed zero', curs: 'Cursive positioning',
  dist: 'Distances', rclt: 'Required contextual alternates', pcap: 'Petite caps', unic: 'Unicase', hist: 'Historical forms',
};
export const featureName = tag => FEATURES[tag] || (/^ss\d\d$/.test(tag) ? `Stylistic set ${+tag.slice(2)}` : /^cv\d\d$/.test(tag) ? `Character variant ${+tag.slice(2)}` : '');

// Features on by default in browsers — the tester shows them ticked.
export const DEFAULT_ON = new Set(['liga', 'calt', 'kern', 'ccmp', 'locl', 'mark', 'mkmk', 'rlig', 'clig', 'init', 'medi', 'fina', 'isol', 'curs', 'dist', 'rclt', 'abvs', 'blwf']);

export function featureTags(font) {
  const tags = new Set();
  for (const t of ['gsub', 'gpos']) for (const f of font.tables?.[t]?.features || []) tags.add(f.tag);
  if (!tags.has('kern') && font.kerningPairs && Object.keys(font.kerningPairs).length) tags.add('kern');
  return [...tags].sort();
}

export function axes(font) {
  return (font.tables?.fvar?.axes || []).map(a => ({
    tag: a.tag, min: a.minValue, max: a.maxValue, def: a.defaultValue,
    name: (a.name && (a.name.en || Object.values(a.name)[0])) || a.tag,
  }));
}
