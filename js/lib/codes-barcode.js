// Barcode types and friendly validation before handing values to bwip-js.

// GS1 mod-10 check digit for the digits given (without the check digit).
export function gs1Check(digits) {
  let sum = 0;
  const d = [...digits].reverse();
  d.forEach((c, i) => { sum += Number(c) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10;
}

// [bwip id, label, fixed length without check (null if free), hint]
export const TYPES = [
  { id: 'ean13', bcid: 'ean13', name: 'EAN-13', gs1: 12, hint: '12 digits (the check digit is added), or all 13 to check it.' },
  { id: 'ean8', bcid: 'ean8', name: 'EAN-8', gs1: 7, hint: '7 digits, or all 8 to check the last one.' },
  { id: 'upca', bcid: 'upca', name: 'UPC-A', gs1: 11, hint: '11 digits, or all 12 to check the last one.' },
  { id: 'itf14', bcid: 'itf14', name: 'ITF-14 (cartons)', gs1: 13, hint: '13 digits, or all 14 to check the last one.' },
  { id: 'code128', bcid: 'code128', name: 'Code 128', hint: 'Any plain letters, digits and symbols (ASCII).' },
  { id: 'code39', bcid: 'code39', name: 'Code 39', hint: 'Capital letters, digits, space and - . $ / + %' },
  { id: 'datamatrix', bcid: 'datamatrix', name: 'Data Matrix', two: true, hint: 'Any text, up to about 1,500 characters.' },
  { id: 'azteccode', bcid: 'azteccode', name: 'Aztec', two: true, hint: 'Any text — used on boarding passes and train tickets.' },
  { id: 'pdf417', bcid: 'pdf417', name: 'PDF417', two: true, hint: 'Any text — used on ID cards and shipping labels.' },
];

// Returns { ok, text, msg, full } — text is what to give bwip-js, full is the human-readable value.
export function checkValue(typeId, raw) {
  const t = TYPES.find(x => x.id === typeId);
  let v = String(raw ?? '');
  if (t.gs1) {
    v = v.replace(/[\s-]/g, '');
    if (!v) return { ok: false, msg: 'Type a number.' };
    if (/\D/.test(v)) return { ok: false, msg: `${t.name} takes digits only — “${v.match(/\D/)[0]}” is not a digit.` };
    if (v.length === t.gs1) { const full = v + gs1Check(v); return { ok: true, text: full, full, msg: `Check digit ${full.slice(-1)} added → ${full}` }; }
    if (v.length === t.gs1 + 1) {
      const want = gs1Check(v.slice(0, -1));
      if (Number(v.slice(-1)) !== want) return { ok: false, msg: `The check digit is wrong: the last digit should be ${want}, not ${v.slice(-1)}. Check the number, or leave the last digit off and it will be worked out.` };
      return { ok: true, text: v, full: v, msg: `Check digit ${want} is correct.` };
    }
    return { ok: false, msg: `${t.name} needs ${t.gs1} or ${t.gs1 + 1} digits — this has ${v.length}.` };
  }
  if (!v) return { ok: false, msg: 'Type something to encode.' };
  if (t.id === 'code39') {
    let msg = '';
    if (/[a-z]/.test(v)) { v = v.toUpperCase(); msg = 'Code 39 has no small letters, so they were made capitals.'; }
    const bad = v.match(/[^A-Z0-9 \-.$/+%]/);
    if (bad) return { ok: false, msg: `Code 39 cannot hold “${bad[0]}”. Use Code 128 for that.` };
    return { ok: true, text: v, full: v, msg };
  }
  if (t.id === 'code128') {
    const bad = v.match(/[^\x00-\x7f]/u);
    if (bad) return { ok: false, msg: `Code 128 here takes plain ASCII only — “${bad[0]}” is not. Data Matrix or Aztec can hold any text.` };
    return { ok: true, text: v, full: v, msg: '' };
  }
  // 2D codes: give bwip-js UTF-8 bytes as a byte string so any language works.
  const bytes = new TextEncoder().encode(v);
  const text = String.fromCharCode(...bytes);
  return { ok: true, text, full: v, msg: bytes.length > v.length ? 'Encoded as UTF-8 bytes.' : '' };
}

// bwip-js errors look like "bwipp.ean13badLength#4500: EAN-13 must be 12 or 13 digits".
export function friendlyError(e) {
  const m = String(e?.message || e);
  if (/toolong|tooLong|exceed|capacity|too ?big/i.test(m)) return 'That is too much data for this barcode type — shorten it or pick a 2D code.';
  const after = m.split(': ').slice(1).join(': ');
  return after || m;
}
