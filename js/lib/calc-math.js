// Shared maths for the Calculators drawer: loads math.js once, number
// formatting, a small pretty-printer (math.js node → HTML), and the polynomial
// work math.js does not do itself — factoring and exact/numeric equation solving.

let loading = null;

// Resolves to { M, deg, rad, frac }: M is a plain math.js instance (for algebra),
// deg/rad are calculator instances with trig in degrees or radians, frac works
// in exact fractions.
export function loadMath() {
  if (!loading) loading = import('../../vendor/mathjs.js').then(mod => {
    const M = mod.create(mod.all);
    const rad = calcInstance(mod, false);
    const deg = calcInstance(mod, true);
    const frac = mod.create(mod.all, { number: 'Fraction' });
    return { M, rad, deg, frac };
  });
  return loading;
}

// Trig results this close to a whole number are rounding noise (sin(π) = 1.2e-16).
const snap = v => {
  if (typeof v !== 'number') return v;
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-13 ? r : v;
};

function calcInstance(mod, degrees) {
  const m = mod.create(mod.all);
  const o = {};
  for (const f of ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'atan2']) o[f] = m[f];
  const k = degrees ? Math.PI / 180 : 1;
  const inArg = x => (x && x.isUnit ? x.toNumber('rad') : typeof x === 'number' ? x * k : x);
  const fwd = name => x => {
    if (typeof x !== 'number' && !(x && x.isUnit)) return o[name](x);
    const a = inArg(x);
    // tan(90°) and friends: say "undefined" rather than 1.6e16.
    if (name === 'tan' || name === 'sec') { if (Math.abs(Math.cos(a)) < 1e-15) return NaN; }
    if (name === 'cot' || name === 'csc') { if (Math.abs(Math.sin(a)) < 1e-15) return NaN; }
    return snap(o[name](a));
  };
  const inv = name => (...xs) => {
    const r = o[name](...xs);
    return typeof r === 'number' ? snap(r / k) : r;
  };
  m.import({
    sin: fwd('sin'), cos: fwd('cos'), tan: fwd('tan'), sec: fwd('sec'), csc: fwd('csc'), cot: fwd('cot'),
    asin: inv('asin'), acos: inv('acos'), atan: inv('atan'), atan2: inv('atan2'),
    ln: x => m.log(x),
  }, { override: true });
  return m;
}

// --- numbers ---------------------------------------------------------------
// Up to 12 significant digits, no float noise, exponent form for huge/tiny.
export function fmtNum(v, sig = 12) {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v !== 'number') return String(v);
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-9) {
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${trimZeros(m)}e${e.replace('+', '')}`;
  }
  return trimZeros(String(+v.toPrecision(sig)));
}
const trimZeros = s => (s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s);

// Number with thousands separators (for display only).
export function groupNum(v, sig = 12) {
  const s = fmtNum(v, sig);
  if (/e|∞|undefined/.test(s)) return s;
  const [i, d] = s.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
}

// Any math.js value as text.
export function fmtValue(M, v) {
  if (typeof v === 'number') return fmtNum(v);
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'function') return 'function';
  if (v.isResultSet) return v.entries.map(e => fmtValue(M, e)).join('; ');
  if (v.isComplex) {
    const re = Math.abs(v.re) < 1e-14 ? 0 : v.re, im = Math.abs(v.im) < 1e-14 ? 0 : v.im;
    if (!im) return fmtNum(re);
    const ims = (Math.abs(im) === 1 ? '' : fmtNum(Math.abs(im))) + 'i';
    if (!re) return (im < 0 ? '-' : '') + ims;
    return `${fmtNum(re)} ${im < 0 ? '-' : '+'} ${ims}`;
  }
  return M.format(v, { precision: 12 });
}

// Normalise the pretty keypad glyphs to math.js syntax.
export const normalise = s => s
  .replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
  .replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/φ/g, 'phi')
  .replace(/²/g, '^2').replace(/³/g, '^3');

// --- pretty printing -------------------------------------------------------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SYM = { pi: 'π', Infinity: '∞', phi: 'φ', tau: 'τ', theta: 'θ', alpha: 'α', beta: 'β', lambda: 'λ', mu: 'μ', omega: 'ω' };

function prec(n) {
  if (n.type === 'OperatorNode') {
    if (n.args.length === 1) return n.fn === 'factorial' ? 5 : 3;
    if (n.op === '+' || n.op === '-') return 1;
    if (n.op === '*' || n.op === '/') return 2;
    if (n.op === '^') return 4;
    return 0;
  }
  if (n.type === 'ConstantNode' && typeof n.value === 'number' && n.value < 0) return 3;
  return 5;
}
const isNum = n => n.type === 'ConstantNode' && typeof n.value === 'number';
const isNegConst = n => isNum(n) && n.value < 0;

export function unwrap(node) {
  return node.transform(n => (n.type === 'ParenthesisNode' ? unwrap(n.content) : n));
}

// node → HTML string (safe: everything escaped).
export function toHTML(node) {
  return pp(unwrap(node));
}
function wrap(n, min) {
  const s = pp(n);
  return prec(n) < min ? `(${s})` : s;
}
function pp(n) {
  switch (n.type) {
    case 'ConstantNode':
      return isNum(n) ? esc(fmtNum(n.value).replace('-', '−')) : esc(n.value);
    case 'SymbolNode': {
      if (SYM[n.name]) return SYM[n.name];
      return n.name.length === 1 ? `<i>${esc(n.name)}</i>` : esc(n.name);
    }
    case 'OperatorNode': {
      const [a, b] = n.args;
      if (n.args.length === 1) {
        if (n.fn === 'unaryMinus') return '−' + wrap(a, 3);
        if (n.fn === 'unaryPlus') return wrap(a, 3);
        if (n.fn === 'factorial') return wrap(a, 5) + '!';
        return esc(n.toString());
      }
      if (n.op === '+') {
        if (isNegConst(b)) return `${pp(a)} − ${esc(fmtNum(-b.value))}`;
        if (b.type === 'OperatorNode' && b.fn === 'unaryMinus') return `${pp(a)} − ${wrap(b.args[0], 2)}`;
        return `${pp(a)} + ${pp(b)}`;
      }
      if (n.op === '-') return `${pp(a)} − ${wrap(b, 2)}`;
      if (n.op === '*') {
        const left = wrap(a, 2), right = wrap(b, 3);
        const jux = n.implicit || (isNum(a) && !isNum(b) && prec(b) >= 2 && !(b.type === 'OperatorNode' && b.op === '*' && isNum(b.args[0])));
        return jux ? `${left}${right}` : `${left} · ${right}`;
      }
      if (n.op === '/') return `<span class="cm-frac"><span>${pp(a)}</span><span>${pp(b)}</span></span>`;
      if (n.op === '^') return `${wrap(a, 5)}<sup>${pp(b)}</sup>`;
      return `${wrap(a, 1)} ${esc(n.op)} ${wrap(b, 1)}`;
    }
    case 'FunctionNode': {
      const name = n.fn.name || n.name;
      const args = n.args.map(pp);
      if (name === 'sqrt') return `√<span class="cm-root">${args[0]}</span>`;
      if (name === 'abs') return `|${args[0]}|`;
      if (name === 'nthRoot' && args.length === 2) return `<sup>${args[1]}</sup>√<span class="cm-root">${args[0]}</span>`;
      return `${esc(name)}(${args.join(', ')})`;
    }
    case 'AssignmentNode':
      return `${esc(n.name || n.object?.name || '')} = ${pp(n.value)}`;
    default:
      return esc(n.toString());
  }
}

// node → plain text people can paste elsewhere.
export function toText(node) {
  return unwrap(node).toString({ parenthesis: 'auto', implicit: 'hide' })
    .replace(/ \^ /g, '^');
}

// --- polynomials -------------------------------------------------------------
// Coefficients highest power first. Numbers only.
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);

// A rational approximation of a float coefficient (from math.js's own arithmetic).
function ratio(x) {
  if (Number.isInteger(x)) return [x, 1];
  for (let d = 1; d <= 100000; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-9 * Math.max(1, Math.abs(x))) return [n, d];
  }
  return null;
}

// Polynomial in one variable from a math.js expression, or null.
// Returns { coeffs (highest first, numbers), den: coeffs of a denominator or null }.
export function polyOf(M, node, v) {
  let r;
  try { r = M.rationalize(node, {}, true); } catch { return null; }
  if (r.variables.some(x => x !== v)) return null;
  const top = unwrap(r.expression);
  if (top.type === 'OperatorNode' && top.op === '/') {
    const num = polyOf(M, top.args[0], v), den = polyOf(M, top.args[1], v);
    if (!num || !den) return null;
    return { coeffs: num.coeffs, den: den.coeffs };
  }
  let c = r.coefficients.length ? r.coefficients.slice().reverse() : null;
  if (!c) {
    try { const val = top.evaluate(); if (typeof val !== 'number') return null; c = [val]; } catch { return null; }
  }
  return { coeffs: trimLead(c), den: null };
}
const trimLead = c => { let i = 0; while (i < c.length - 1 && Math.abs(c[i]) < 1e-14) i++; return c.slice(i); };

// Scale rational coefficients to integers with no common factor (sign kept).
function integerise(c) {
  const rs = c.map(ratio);
  if (rs.some(r => !r)) return null;
  const L = rs.reduce((l, [, d]) => lcm(l, d), 1);
  const ints = rs.map(([n, d]) => n * (L / d));
  if (ints.some(x => !Number.isSafeInteger(x))) return null;
  return { ints, scale: L };
}

// Exact evaluation of an integer polynomial at p/q, ×q^n (BigInt, so no overflow).
function evalPQ(a, p, q) {
  let s = 0n;
  const P = BigInt(p), Q = BigInt(q), n = a.length - 1;
  for (let i = 0; i <= n; i++) s += BigInt(a[i]) * P ** BigInt(n - i) * Q ** BigInt(i);
  return s;
}
function divisors(n) {
  n = Math.abs(n);
  if (n > 1e9) return [1];
  const out = [];
  for (let i = 1; i * i <= n; i++) if (n % i === 0) { out.push(i); if (i * i !== n) out.push(n / i); }
  return out.sort((x, y) => x - y);
}
// Divide integer poly a by (q x − p); exact when p/q is a root.
function divLinear(a, p, q) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const c = (a[i] + carry) / q;
    out.push(c);
    carry = c * p;
  }
  return out;
}

// All complex roots of a numeric polynomial (Aberth–Ehrlich), as [re, im] pairs.
export function polyRoots(c) {
  c = trimLead(c);
  const n = c.length - 1;
  if (n < 1) return [];
  const a = c.map(x => x / c[0]);
  if (n === 1) return [[-a[1], 0]];
  if (n === 2) {
    const D = a[1] * a[1] - 4 * a[2];
    if (D >= 0) { const s = Math.sqrt(D); return [[(-a[1] - s) / 2, 0], [(-a[1] + s) / 2, 0]]; }
    const s = Math.sqrt(-D) / 2; return [[-a[1] / 2, -s], [-a[1] / 2, s]];
  }
  const R = 1 + Math.max(...a.slice(1).map(Math.abs));
  let z = Array.from({ length: n }, (_, k) => cx.polar(R * 0.7, 2 * Math.PI * k / n + 0.4));
  const ev = x => { let p = [1, 0], d = [0, 0]; for (let i = 1; i <= n; i++) { d = cx.add(cx.mul(d, x), p); p = cx.add(cx.mul(p, x), [a[i], 0]); } return [p, d]; };
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      const [p, d] = ev(zi);
      if (cx.abs(p) === 0) return zi;
      const ratio = cx.div(p, d);
      let s = [0, 0];
      z.forEach((zj, j) => { if (j !== i) s = cx.add(s, cx.div([1, 0], cx.sub(zi, zj))); });
      const w = cx.div(ratio, cx.sub([1, 0], cx.mul(ratio, s)));
      moved = Math.max(moved, cx.abs(w));
      return cx.sub(zi, w);
    });
    if (moved < 1e-15) break;
  }
  return z.map(([re, im]) => [Math.abs(re) < 1e-12 ? 0 : re, Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re)) ? 0 : im]);
}
const cx = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  abs: a => Math.hypot(a[0], a[1]),
  polar: (r, t) => [r * Math.cos(t), r * Math.sin(t)],
};

// Factor over the rationals. coeffs highest first.
// Returns { constant: [num, den], factors: [{ c: int coeffs, pow }] } or null.
export function factorPoly(coeffs) {
  const ii = integerise(trimLead(coeffs));
  if (!ii) return null;
  let a = ii.ints;
  let g = a.reduce((x, y) => gcd(x, y), 0) || 1;
  if (a[0] < 0) g = -g;
  a = a.map(x => x / g);
  const factors = [];
  const add = c => {
    const key = c.join(',');
    const f = factors.find(f => f.c.join(',') === key);
    if (f) f.pow++; else factors.push({ c, pow: 1 });
  };
  // x^k
  while (a.length > 1 && a[a.length - 1] === 0) { a = a.slice(0, -1); add([1, 0]); }
  // rational roots p/q
  let found = true;
  while (found && a.length > 2) {
    found = false;
    const ps = divisors(a[a.length - 1]), qs = divisors(a[0]);
    outer: for (const q of qs) for (const p0 of ps) for (const p of [p0, -p0]) {
      if (gcd(p, q) !== 1) continue;
      if (evalPQ(a, p, q) === 0n) { a = divLinear(a, p, q); add([q, -p]); found = true; break outer; }
    }
  }
  if (a.length === 2) {
    let [q, p] = a; // q x + p
    const d = gcd(q, p) || 1; // keep primitive, move content out
    if (q < 0) { add([-q / d, -p / d]); g = -g * d; } else { add([q / d, p / d]); g *= d; }
    a = [1];
  }
  // A quartic with no rational roots may still split into two rational quadratics.
  if (a.length === 5) {
    const r = polyRoots(a);
    const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
    for (const pr of pairs) {
      const qs = pr.map(([i, j]) => {
        const s = cx.add(r[i], r[j]), p = cx.mul(r[i], r[j]);
        if (Math.abs(s[1]) > 1e-7 || Math.abs(p[1]) > 1e-7) return null;
        return [1, -s[0], p[0]];
      });
      if (qs.some(q => !q)) continue;
      // Allow the leading coefficient to split between the two.
      for (const L1 of divisors(a[0])) {
        const L2 = a[0] / L1;
        const q1 = qs[0].map(x => x * L1), q2 = qs[1].map(x => x * L2);
        const near = q => q.every(x => Math.abs(x - Math.round(x)) < 1e-6);
        if (near(q1) && near(q2)) {
          add(q1.map(Math.round)); add(q2.map(Math.round)); a = [1]; break;
        }
      }
      if (a.length === 1) break;
    }
  }
  if (a.length > 1 || a[0] !== 1) {
    if (a.length > 1) add(a); else g *= a[0];
  }
  // The constant is g / scale.
  const d = gcd(g, ii.scale) || 1;
  return { constant: [g / d, ii.scale / d], factors };
}

// Integer coefficients → math.js-parsable string in v.
export function polyString(c, v = 'x') {
  const n = c.length - 1;
  const parts = [];
  c.forEach((k, i) => {
    if (!k) return;
    const p = n - i;
    const mag = Math.abs(k);
    const coef = p && mag === 1 ? '' : fmtNum(mag);
    const term = p === 0 ? coef : p === 1 ? `${coef}${coef ? ' ' : ''}${v}` : `${coef}${coef ? ' ' : ''}${v}^${p}`;
    parts.push((k < 0 ? '-' : '+') + ' ' + term);
  });
  if (!parts.length) return '0';
  let s = parts.join(' ');
  return s.startsWith('+ ') ? s.slice(2) : '-' + s.slice(2);
}

export function factorString(f, v = 'x') {
  const [cn, cd] = f.constant;
  const lead = cd === 1 ? (cn === 1 ? '' : cn === -1 ? '-' : `${cn} `) : `${cn}/${cd} `;
  if (!f.factors.length) return cd === 1 ? String(cn) : `${cn}/${cd}`;
  const body = f.factors.map(({ c, pow }) => {
    const s = polyString(c, v);
    const single = c.length === 2 && c[0] === 1 && c[1] === 0;
    const alone = f.factors.length === 1 && pow === 1 && !lead;
    const base = single ? v : alone ? s : `(${s})`;
    return pow > 1 ? `${base}^${pow}` : base;
  }).join(' ');
  return lead === '-' ? `-${body}` : lead + body;
}

// --- exact roots for display ------------------------------------------------
// Square root of an integer as [outside, inside]: √72 → [6, 2].
function surd(n) {
  let out = 1, inside = n;
  for (let k = 2; k * k <= inside; k++) while (inside % (k * k) === 0) { inside /= k * k; out *= k; }
  return [out, inside];
}
const fracText = (n, d) => { const g = gcd(n, d) || 1; n /= g; d /= g; if (d < 0) { n = -n; d = -d; } return d === 1 ? String(n) : `${n}/${d}`; };

// Roots of an integer quadratic as exact text where possible.
function quadRootsText(a, b, c) {
  const D = b * b - 4 * a * c;
  if (D === 0) return [{ text: fracText(-b, 2 * a), real: true, value: -b / (2 * a) }];
  const [o, inn] = surd(Math.abs(D));
  const den = 2 * a;
  if (inn === 1 && D > 0) return [fracText(-b - o, den), fracText(-b + o, den)].map((t, i) => ({ text: t, real: true, value: (-b + (i ? o : -o)) / den }));
  const g = gcd(gcd(b, o), den) || 1;
  const B = -b / g, O = o / g, Dn = den / g;
  const rad = D > 0 ? `√${inn}` : inn === 1 ? 'i' : `√${inn} i`;
  const oText = (O === 1 ? '' : O) + rad;
  const sign = Dn < 0 ? -1 : 1;
  const top = (s) => `${B * sign ? fmtNum(B * sign) + ` ${s} ` : s === '-' ? '-' : ''}${oText}`;
  const wrapDen = t => (Math.abs(Dn) === 1 ? t : B ? `(${t})/${Math.abs(Dn)}` : `${t}/${Math.abs(Dn)}`);
  const re = -b / (2 * a), im = Math.sqrt(Math.abs(D)) / (2 * Math.abs(a));
  if (D > 0) return [{ text: wrapDen(top('-')), real: true, value: re - im }, { text: wrapDen(top('+')), real: true, value: re + im }];
  return [{ text: wrapDen(top('-')), real: false, value: [re, -im] }, { text: wrapDen(top('+')), real: false, value: [re, im] }];
}

// Solve polynomial = 0. Returns [{ text, real, value, exact }].
export function solvePoly(coeffs) {
  const f = factorPoly(coeffs);
  const out = [];
  const push = r => { if (!out.some(o => o.text === r.text)) out.push(r); };
  if (f) {
    for (const { c } of f.factors) {
      if (c.length === 2) push({ text: fracText(-c[1], c[0]), real: true, value: -c[1] / c[0], exact: true });
      else if (c.length === 3) quadRootsText(...c).forEach(r => push({ ...r, exact: true }));
      else polyRoots(c).forEach(([re, im]) => push(im ? { text: `${fmtNum(re, 8)} ${im < 0 ? '-' : '+'} ${fmtNum(Math.abs(im), 8)}i`, real: false, value: [re, im], exact: false } : { text: fmtNum(re, 10), real: true, value: re, exact: false }));
    }
  } else {
    polyRoots(coeffs).forEach(([re, im]) => push(im ? { text: `${fmtNum(re, 8)} ${im < 0 ? '-' : '+'} ${fmtNum(Math.abs(im), 8)}i`, real: false, value: [re, im], exact: false } : { text: fmtNum(re, 10), real: true, value: re, exact: false }));
  }
  return out.sort((x, y) => (x.real === y.real ? (x.real ? x.value - y.value : x.value[0] - y.value[0] || x.value[1] - y.value[1]) : x.real ? -1 : 1));
}

// --- numeric roots of any f(x) ------------------------------------------------
// Sign changes on a grid, then bisection. Skips poles (where |f| blows up).
export function numericRoots(f, lo, hi, steps = 4000) {
  const roots = [];
  const h = (hi - lo) / steps;
  let x0 = lo, y0 = safe(f, lo);
  const add = r => { if (!roots.some(q => Math.abs(q - r) < Math.abs(h) / 2)) roots.push(r); };
  for (let i = 1; i <= steps; i++) {
    const x1 = lo + i * h, y1 = safe(f, x1);
    if (y0 === 0) add(x0);
    else if (Number.isFinite(y0) && Number.isFinite(y1) && y0 * y1 < 0) {
      const r = bisect(f, x0, x1, y0);
      if (r != null) add(r);
    } else if (Number.isFinite(y0) && Number.isFinite(y1) && i > 1) {
      // A touching root (like x² at 0): check the minimum of |f| in the cell.
      const xm = (x0 + x1) / 2, ym = safe(f, xm);
      if (Number.isFinite(ym) && Math.abs(ym) < 1e-10 && Math.abs(ym) <= Math.abs(y0) && Math.abs(ym) <= Math.abs(y1)) add(xm);
    }
    x0 = x1; y0 = y1;
  }
  return roots;
}
function safe(f, x) { try { const y = f(x); return typeof y === 'number' ? y : NaN; } catch { return NaN; } }
function bisect(f, a, b, fa) {
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2, fm = safe(f, m);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0 || (b - a) / 2 < 1e-13 * Math.max(1, Math.abs(m))) { a = b = m; break; }
    if (fa * fm < 0) b = m; else { a = m; fa = fm; }
  }
  const r = (a + b) / 2, fr = safe(f, r);
  // Reject poles: a real root has a small value there.
  const scale = Math.max(1, Math.abs(safe(f, r + 1e-3)), Math.abs(safe(f, r - 1e-3)));
  return Math.abs(fr) < 1e-6 * scale ? r : null;
}

// Symbols in an expression that are unknowns (not functions or constants).
export function unknowns(M, node) {
  const skip = new Set(['pi', 'e', 'i', 'Infinity', 'NaN', 'phi', 'tau', 'E', 'PI', 'true', 'false', 'null']);
  const out = new Set();
  node.traverse((n, path, parent) => {
    if (n.type !== 'SymbolNode') return;
    if (parent && parent.type === 'FunctionNode' && path === 'fn') return;
    if (skip.has(n.name)) return;
    try { if (typeof M[n.name] === 'function' || M.Unit.isValuelessUnit?.(n.name) && n.name.length > 1) return; } catch {}
    out.add(n.name);
  });
  return [...out];
}

// Linear system with exact fractions via Gauss–Jordan. A rows of numbers, b numbers.
// Returns { x: [Fraction] } or { none: true } or { many: true }.
export function solveLinear(M, A, b) {
  const n = A[0].length, m = A.length;
  const R = A.map((row, i) => [...row.map(v => M.fraction(v)), M.fraction(b[i])]);
  let r = 0;
  const piv = [];
  for (let c = 0; c < n && r < m; c++) {
    let p = r;
    while (p < m && Number(R[p][c].n) === 0) p++;
    if (p === m) continue;
    [R[r], R[p]] = [R[p], R[r]];
    const pv = R[r][c];
    R[r] = R[r].map(v => v.div(pv));
    for (let i = 0; i < m; i++) if (i !== r && Number(R[i][c].n) !== 0) {
      const k = R[i][c];
      R[i] = R[i].map((v, j) => v.sub(k.mul(R[r][j])));
    }
    piv.push(c); r++;
  }
  for (let i = r; i < m; i++) if (Number(R[i][n].n) !== 0) return { none: true };
  if (r < n) return { many: true };
  const x = Array(n);
  piv.forEach((c, i) => { x[c] = R[i][n]; });
  return { x };
}
