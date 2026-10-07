// Paper, envelope, photo and card sizes for the Paper sizes tool.
// Each size is [name, width, height, unit] in portrait, unit 'mm' or 'in'.

const iso = (prefix, list) => list.map(([w, hgt], i) => [prefix + i, w, hgt, 'mm']);

export const PAPER = [
  { id: 'iso-a', name: 'ISO A', note: 'A4 is the everyday sheet almost everywhere outside North America.',
    sizes: iso('A', [[841, 1189], [594, 841], [420, 594], [297, 420], [210, 297], [148, 210], [105, 148], [74, 105], [52, 74], [37, 52], [26, 37]]) },
  { id: 'iso-b', name: 'ISO B', note: 'Between the A sizes — posters, books and passports (B7).',
    sizes: iso('B', [[1000, 1414], [707, 1000], [500, 707], [353, 500], [250, 353], [176, 250], [125, 176], [88, 125], [62, 88], [44, 62], [31, 44]]) },
  { id: 'iso-c', name: 'ISO C (envelopes)', note: 'A C envelope takes the matching A sheet flat: A4 fits C4.',
    sizes: iso('C', [[917, 1297], [648, 917], [458, 648], [324, 458], [229, 324], [162, 229], [114, 162], [81, 114], [57, 81], [40, 57], [28, 40]]) },
  { id: 'us', name: 'US & Canada', note: 'Inch-based sizes used in North America and parts of Latin America.',
    sizes: [['Letter', 8.5, 11, 'in'], ['Legal', 8.5, 14, 'in'], ['Tabloid', 11, 17, 'in'], ['Ledger', 17, 11, 'in'],
      ['Executive', 7.25, 10.5, 'in'], ['Half Letter (Statement)', 5.5, 8.5, 'in'], ['Junior Legal', 5, 8, 'in'],
      ['Government Letter', 8, 10.5, 'in'], ['ANSI C', 17, 22, 'in'], ['ANSI D', 22, 34, 'in'], ['ANSI E', 34, 44, 'in']] },
  { id: 'jis-b', name: 'JIS B (Japan)', note: 'Japanese B sizes are a little bigger than ISO B.',
    sizes: iso('JIS B', [[1030, 1456], [728, 1030], [515, 728], [364, 515], [257, 364], [182, 257], [128, 182], [91, 128], [64, 91], [45, 64], [32, 45]]) },
  { id: 'env', name: 'Envelopes', note: 'DL takes an A4 sheet folded in three.',
    sizes: [['DL', 110, 220, 'mm'], ['C6/5', 114, 229, 'mm'], ['C5', 162, 229, 'mm'], ['C4', 229, 324, 'mm'], ['B4 envelope', 250, 353, 'mm'],
      ['US #10', 4.125, 9.5, 'in'], ['US #9', 3.875, 8.875, 'in'], ['Monarch', 3.875, 7.5, 'in'], ['A7 invitation', 5.25, 7.25, 'in'], ['A2 note card', 4.375, 5.75, 'in']] },
  { id: 'photo', name: 'Photo prints', note: 'The “R” names are what photo shops in Malaysia and Asia use.',
    sizes: [['3R (3.5 × 5)', 3.5, 5, 'in'], ['4R (4 × 6)', 4, 6, 'in'], ['5R (5 × 7)', 5, 7, 'in'], ['6R (6 × 8)', 6, 8, 'in'],
      ['8R (8 × 10)', 8, 10, 'in'], ['10R (10 × 12)', 10, 12, 'in'], ['11R (11 × 14)', 11, 14, 'in'], ['8 × 12', 8, 12, 'in'],
      ['Passport 35 × 45 mm (UK, EU and many others)', 35, 45, 'mm'], ['Passport 35 × 50 mm (Malaysia)', 35, 50, 'mm'], ['US passport 2 × 2 in', 2, 2, 'in']] },
  { id: 'cards', name: 'Cards', note: 'Business cards are usually printed landscape; shown here as they are listed.',
    sizes: [['Bank / ID card (ISO 7810 ID-1)', 85.6, 53.98, 'mm'], ['Business card — US', 3.5, 2, 'in'], ['Business card — Europe', 85, 55, 'mm'],
      ['Business card — Malaysia & Singapore', 90, 54, 'mm'], ['Business card — Japan', 91, 55, 'mm'], ['Business card — China', 90, 54, 'mm'],
      ['Index card 3 × 5', 3, 5, 'in'], ['Index card 4 × 6', 4, 6, 'in'], ['Postcard (A6)', 105, 148, 'mm']] },
];

export const ALL = PAPER.flatMap(g => g.sizes.map(s => ({ group: g.id, name: s[0], w: s[1], h: s[2], unit: s[3] })));
export const find = name => ALL.find(s => s.name === name);

export const toMM = (v, unit) => unit === 'in' ? v * 25.4 : v;

// A length in mm, written in unit (mm, cm, in, pt, px at dpi).
export function fromMM(mm, unit, dpi = 96) {
  switch (unit) {
    case 'mm': return mm;
    case 'cm': return mm / 10;
    case 'in': return mm / 25.4;
    case 'pt': return mm / 25.4 * 72;
    case 'px': return mm / 25.4 * dpi;
  }
  return NaN;
}

const DIGITS = { mm: 1, cm: 2, in: 3, pt: 2, px: 0 };
export const fmt = (v, unit) => {
  const d = DIGITS[unit];
  return (+v.toFixed(d)).toLocaleString('en-GB', { maximumFractionDigits: d });
};

// "210 × 297 mm" for a size in a unit.
export function sizeIn(s, unit, dpi) {
  const w = fromMM(toMM(s.w, s.unit), unit, dpi), hh = fromMM(toMM(s.h, s.unit), unit, dpi);
  return `${fmt(w, unit)} × ${fmt(hh, unit)} ${unit}`;
}
