// Calculators drawer: scientific calculator, algebra, graphs, units, time
// zones & date maths, silly units, percentages & ratios.
// math.js (vendor/mathjs.js) is loaded on demand by js/lib/calc-math.js.
import { h, field, input, select, checkbox, output, note, row, card, tabs, on, copy, download, textarea } from '../ui.js';
import { sendBtn, asFile, textOf } from '../hub.js';
import { icon } from '../icons.js';
import {
  loadMath, fmtNum, groupNum, fmtValue, normalise, toHTML, toText, polyOf, factorPoly, factorString,
  solvePoly, numericRoots, unknowns, solveLinear,
} from '../lib/calc-math.js';
import { CATEGORIES, INGREDIENTS, convert, densityOf, SILLY, SILLY_INPUT } from '../lib/calc-units.js';
import {
  CITIES, validZone, wall, offsetMin, zoned, offsetText, parseDate, dayNum, fromDayNum, weekday, iso, longDate,
  ymd, addYMD, workingDays, addWorkingDays, DAY_NAMES,
} from '../lib/calc-dates.js';

const G = 'calc';
const num = s => {
  const t = String(s ?? '').replace(/[,\s]/g, '').replace(/[−–]/g, '-');
  return t === '' ? NaN : Number(t);
};
const numInput = (value, placeholder = '') => {
  const el = input({ value, placeholder });
  el.inputMode = 'decimal';
  return el;
};
const loadingNote = () => h('p', { class: 'field-hint cs-loading' }, 'Loading the maths engine…');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('toolbox.calc.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('toolbox.calc.' + k, JSON.stringify(v)); } catch {} },
};
const session = {
  get(k, d) { try { return JSON.parse(sessionStorage.getItem('toolbox.calc.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem('toolbox.calc.' + k, JSON.stringify(v)); } catch {} },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ============================================================================
// 1. Scientific calculator
// ============================================================================
const KEYS = [
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'ln('], ['log', 'log10('],
  ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('], ['eˣ', 'e^('], ['10ˣ', '10^('],
  ['x²', '^2'], ['xʸ', '^'], ['√', '√('], ['1/x', '^(-1)'], ['n!', '!'],
  ['(', '('], [')', ')'], ['π', 'π'], ['e', 'e'], ['%', '%'],
  ['7'], ['8'], ['9'], ['÷', '÷'], ['⌫', 'BACK'],
  ['4'], ['5'], ['6'], ['×', '×'], ['AC', 'CLEAR'],
  ['1'], ['2'], ['3'], ['−', '−'], ['Ans', 'Ans'],
  ['0'], ['.'], ['×10ˣ', '×10^'], ['+', '+'], ['=', 'EQ'],
];
const CONSTANTS = [
  ['φ golden ratio', 'φ'], ['c light (m/s)', '299792458'], ['g gravity (m/s²)', '9.80665'],
  ['Nₐ Avogadro', '6.02214076e23'], ['h Planck', '6.62607015e-34'], ['k Boltzmann', '1.380649e-23'],
];

const sci = {
  id: 'calc-sci', name: 'Scientific calculator', group: G, icon: 'calculator',
  desc: 'Big keypad or typed sums: trig in degrees or radians, memory, Ans, constants and exact fractions.',
  keywords: 'calculator scientific kalkulator sin cos tan log ln fraction memory ans sqrt power factorial',
  accepts: ['text'],
  render(root, incoming) {
    const st = Object.assign({ hist: [], mem: 0, ans: 0, mode: 'deg', vars: {} }, session.get('sci', {}));
    const save = () => session.set('sci', st);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const expr = h('input', {
      class: 'input mono cs-expr', type: 'text', placeholder: 'e.g. sin(30) + 2^10',
      spellcheck: false, autocomplete: 'off', autocapitalize: 'off', enterKeyHint: 'done', 'aria-label': 'Expression',
    });
    if (coarse) expr.inputMode = 'none';
    const live = h('div', { class: 'cs-result', 'aria-live': 'polite' });
    const exact = h('div', { class: 'cs-exact' });
    const err = note();
    const memShow = h('span', { class: 'cs-mem' });
    const mode = tabs([['deg', 'Degrees'], ['rad', 'Radians']], st.mode, v => { st.mode = v; save(); preview(); });
    const histList = h('ol', { class: 'cs-hist' });
    let M = null, justDone = false;

    const kbBtn = coarse && h('button', {
      class: 'btn small ghost', type: 'button', title: 'Use the phone keyboard',
      onclick: () => { expr.inputMode = expr.inputMode === 'none' ? 'text' : 'none'; expr.blur(); expr.focus(); kbBtn.classList.toggle('on', expr.inputMode !== 'none'); },
    }, icon('keyboard', 18));

    function calc(src, commit) {
      const s = normalise(src).trim();
      if (!s) return null;
      const m = st.mode === 'deg' ? M.deg : M.rad;
      const scope = { ...st.vars, Ans: st.ans, ans: st.ans };
      let v = m.evaluate(s, scope);
      if (v && v.isResultSet) v = v.entries[v.entries.length - 1];
      if (typeof v === 'function' || v === undefined) throw new Error('That is a function, not a number');
      let fr = '';
      if (/^[\d\s+\-*/^().!%]+$/.test(s.replace(/\bAns\b/g, '')) && !/\bAns\b/.test(s) && typeof v === 'number' && !Number.isInteger(v)) {
        try {
          const f = M.frac.evaluate(s);
          if (f && f.isFraction && f.d > 1n && f.d <= 1000000n) fr = (f.s < 0n ? '−' : '') + `${f.n}/${f.d}`;
        } catch {}
      }
      if (commit) {
        for (const [k, val] of Object.entries(scope)) if (k !== 'Ans' && k !== 'ans' && typeof val === 'number') st.vars[k] = val;
        if (typeof v === 'number') st.ans = v;
      }
      return { text: fmtValue(M.M, v), fr, v };
    }
    function preview() {
      if (!M) return;
      err.clear();
      try {
        const r = calc(expr.value, false);
        live.textContent = r ? '= ' + r.text : '';
        exact.textContent = r?.fr ? `exactly ${r.fr}` : '';
        live.classList.remove('cs-done');
      } catch { live.textContent = ''; exact.textContent = ''; }
    }
    function commit() {
      if (!M || !expr.value.trim()) return;
      try {
        const r = calc(expr.value, true);
        if (!r) return;
        live.textContent = '= ' + r.text;
        live.classList.add('cs-done');
        exact.textContent = r.fr ? `exactly ${r.fr}` : '';
        st.hist.unshift({ e: expr.value.trim(), r: r.text });
        st.hist = st.hist.slice(0, 60);
        save(); drawHist();
        justDone = true;
      } catch (e) {
        err.error(friendly(e.message));
      }
    }
    function ins(t) {
      if (justDone) {
        if (/^[+\-−×÷^!%]/.test(t) || t === '^2' || t === '^(-1)' || t === '×10^') expr.value = 'Ans';
        else expr.value = '';
        justDone = false;
      }
      const s = expr.selectionStart ?? expr.value.length, e = expr.selectionEnd ?? s;
      const atEnd = document.activeElement !== expr;
      const a = atEnd ? expr.value.length : s, b = atEnd ? expr.value.length : e;
      expr.value = expr.value.slice(0, a) + t + expr.value.slice(b);
      const p = a + t.length;
      try { expr.setSelectionRange(p, p); } catch {}
      expr.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function back() {
      justDone = false;
      const atEnd = document.activeElement !== expr;
      const s = atEnd ? expr.value.length : expr.selectionStart, e = atEnd ? s : expr.selectionEnd;
      if (s !== e) expr.value = expr.value.slice(0, s) + expr.value.slice(e);
      else if (s > 0) {
        // Remove a whole function name like "sin(" in one go.
        const m = /(asin|acos|atan|sin|cos|tan|log10|ln|sqrt|√|Ans)\(?$/.exec(expr.value.slice(0, s));
        const n = m ? m[0].length : 1;
        expr.value = expr.value.slice(0, s - n) + expr.value.slice(s);
        try { expr.setSelectionRange(s - n, s - n); } catch {}
      }
      expr.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function clear() { expr.value = ''; justDone = false; err.clear(); expr.dispatchEvent(new Event('input', { bubbles: true })); }
    function press(k) {
      const act = k[1] ?? k[0];
      if (act === 'EQ') commit();
      else if (act === 'BACK') back();
      else if (act === 'CLEAR') clear();
      else ins(act);
    }
    const memVal = () => {
      try { const r = expr.value.trim() ? calc(expr.value, false) : null; return r && typeof r.v === 'number' ? r.v : st.ans; } catch { return st.ans; }
    };
    function showMem() { memShow.textContent = st.mem ? `M = ${fmtNum(st.mem)}` : ''; }
    const memBtn = (label, fn, title) => h('button', { class: 'btn small', type: 'button', title, onclick: () => { fn(); save(); showMem(); } }, label);

    const pad = h('div', { class: 'cs-pad' }, KEYS.map(k => h('button', {
      type: 'button',
      class: 'cs-key' + (/^\d$|^\.$/.test(k[0]) ? ' num' : '') + (k[1] === 'EQ' ? ' eq' : '') + (['÷', '×', '−', '+'].includes(k[0]) ? ' op' : '') + (['CLEAR', 'BACK'].includes(k[1]) ? ' del' : ''),
      'aria-label': { '⌫': 'Delete', AC: 'Clear', '=': 'Equals', '√': 'Square root', 'x²': 'Squared', 'xʸ': 'Power' }[k[0]] || k[0],
      onclick: () => press(k),
    }, k[0])));

    function drawHist() {
      histList.replaceChildren(...st.hist.map(it => h('li', {},
        h('button', { type: 'button', class: 'cs-h-expr', title: 'Use this sum again', onclick: () => { expr.value = it.e; justDone = false; expr.dispatchEvent(new Event('input', { bubbles: true })); } }, it.e),
        h('button', { type: 'button', class: 'cs-h-res', title: 'Insert this result', onclick: () => ins(it.r.replace(/\s/g, '')) }, '= ' + it.r))));
      if (!st.hist.length) histList.append(h('li', { class: 'field-hint' }, 'Sums you finish with = appear here. Tap one to use it again.'));
    }

    expr.addEventListener('input', preview);
    expr.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); clear(); }
      else justDone = false;
    });
    // Keys typed while a keypad button has focus still go into the sum.
    root.addEventListener('keydown', e => {
      if (e.target === expr || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); commit(); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Escape') clear();
      else if (/^[\w.+\-*/^()!%, ]$/.test(e.key)) { e.preventDefault(); ins(e.key); }
    });

    const loading = loadingNote();
    root.append(
      card(
        h('div', { class: 'cs-top' }, mode, h('div', { class: 'row tight' }, memShow, kbBtn)),
        h('div', { class: 'cs-screen' }, h('div', { class: 'cs-line' }, expr), live, exact),
        err.el, loading,
        h('div', { class: 'cs-mrow' },
          memBtn('MC', () => { st.mem = 0; }, 'Clear memory'),
          memBtn('MR', () => ins(fmtNum(st.mem)), 'Recall memory'),
          memBtn('M+', () => { st.mem += memVal(); }, 'Add to memory'),
          memBtn('M−', () => { st.mem -= memVal(); }, 'Subtract from memory')),
        pad,
        h('div', { class: 'chips cs-consts' }, CONSTANTS.map(([l, v]) => h('button', { type: 'button', class: 'chip', onclick: () => ins(v) }, l)))),
      card(h('div', { class: 'output-head' }, h('h3', {}, 'History'),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { st.hist = []; save(); drawHist(); } }, 'Clear'))),
        histList),
      h('p', { class: 'field-hint' }, 'Type with your keyboard too: Enter for =, Esc to clear. Units work as well (5 km + 300 m, 30 deg). You can store values: r = 4, then pi r^2.'));
    showMem(); drawHist();
    loadMath().then(m => {
      M = m; loading.remove(); preview();
      if (!coarse) expr.focus();
    });
    if (incoming) textOf(incoming).then(t => { if (t) { expr.value = t.trim().split('\n')[0]; expr.dispatchEvent(new Event('input', { bubbles: true })); } });
  },
};

function friendly(msg) {
  if (/Undefined symbol (\S+)/.test(msg)) return `Unknown name “${msg.match(/Undefined symbol (\S+)/)[1]}”.`;
  if (/Unexpected end/.test(msg)) return 'The sum stops too early — a bracket or number is missing.';
  if (/Parenthesis \) expected/.test(msg)) return 'A closing bracket “)” is missing.';
  if (/Unexpected operator|Value expected/.test(msg)) return 'Two operators in a row, or one is missing a number.';
  return msg;
}

// ============================================================================
// 2. Algebra
// ============================================================================
const ALG_EXAMPLES = {
  simplify: ['2x + 3x - x^2/x', '(x^2 - 1)/(x - 1)', 'sin(x)^2 + cos(x)^2'],
  expand: ['(x + 1)^3', '(2a - b)(a + 3b)', '(x - 2)(x + 2)(x^2 + 4)'],
  factor: ['x^2 - 5x + 6', '6x^2 - x - 2', 'x^4 - 16', 'x^3 - 8'],
  solve: ['x^2 - 5x + 6 = 0', '2x + 3 = 11', 'x^3 = 8', 'cos(x) = x', 'x + y = 10\nx - y = 2'],
  derive: ['x^3', 'sin(x) * x^2', 'e^(2x)', 'ln(x^2 + 1)'],
};

const algebra = {
  id: 'calc-algebra', name: 'Algebra calculator', group: G, icon: 'function-square',
  desc: 'Simplify, expand, factor, solve equations and simple systems, and take derivatives.',
  keywords: 'algebra simplify expand factor factorise solve equation quadratic roots derivative differentiate system polynomial',
  accepts: ['text'],
  render(root, incoming) {
    const mode = tabs([['simplify', 'Simplify'], ['expand', 'Expand'], ['factor', 'Factor'], ['solve', 'Solve'], ['derive', 'Derivative']], 'solve', () => { examples(); run(); });
    const src = textarea({ rows: 3, placeholder: 'e.g. x^2 - 5x + 6 = 0', value: 'x^2 - 5x + 6 = 0' });
    const vIn = input({ placeholder: 'auto' });
    vIn.classList.add('ca-var');
    const order = select([['1', 'First'], ['2', 'Second'], ['3', 'Third']], '1');
    const orderField = field('Order', order);
    const ex = h('div', { class: 'chips' });
    const pretty = h('div', { class: 'cm-pretty', 'aria-live': 'polite' });
    const plain = output('As text');
    const msg = note();
    const loading = loadingNote();
    let M = null;

    function examples() {
      ex.replaceChildren(...ALG_EXAMPLES[mode.value].map(e => h('button', { type: 'button', class: 'chip', onclick: () => { src.value = e; run(); } }, e.replace('\n', ' ; '))));
      orderField.hidden = mode.value !== 'derive';
    }
    function pickVar(node) {
      const want = vIn.value.trim();
      if (want) return want;
      const u = unknowns(M, node);
      return u.includes('x') ? 'x' : u[0] || 'x';
    }
    const show = (html, text) => { pretty.innerHTML = html; plain.set(text); };

    function run() {
      if (!M) return;
      msg.clear(); show('', '');
      const raw = normalise(src.value).trim();
      if (!raw) return;
      try {
        const m = mode.value;
        if (m === 'solve') return solve(raw);
        if (raw.includes('=')) throw new Error('Use Solve for equations with “=”.');
        const node = M.parse(raw);
        const v = pickVar(node);
        if (m === 'simplify') {
          const r = M.simplify(node);
          show(toHTML(r), toText(r));
          if (unknowns(M, r).length === 0) { try { const val = r.evaluate(); if (typeof val === 'number') msg.info(`≈ ${fmtNum(val)}`); } catch {} }
        } else if (m === 'expand') {
          let r;
          try { r = M.rationalize(node); } catch { r = null; }
          if (!r) { r = M.simplify(node); msg.info('Only polynomials (and fractions of them) can be expanded; this is the simplified form.'); }
          show(toHTML(r), toText(r));
        } else if (m === 'factor') {
          const p = polyOf(M, node, v);
          if (!p || p.den) throw new Error(`Factoring works on polynomials in one letter (here ${v}) — with no other letters, functions or fractions of polynomials.`);
          const f = factorPoly(p.coeffs);
          if (!f) throw new Error('The coefficients are too big or not rational, so it cannot be factored exactly.');
          const s = factorString(f, v);
          const n = M.parse(s);
          show(toHTML(n), toText(n));
          const irreducible = f.factors.filter(x => x.c.length > 2);
          if (irreducible.length) msg.info('Factors of degree 2 or more cannot be split further using whole numbers and fractions (they may still have irrational or complex roots — try Solve).');
        } else if (m === 'derive') {
          let r = node;
          for (let i = 0; i < +order.value; i++) r = M.derivative(r, v);
          r = M.simplify(r);
          const lhs = `d${+order.value > 1 ? '<sup>' + order.value + '</sup>' : ''}/d<i>${esc(v)}</i>${+order.value > 1 ? '<sup>' + order.value + '</sup>' : ''}`;
          pretty.innerHTML = `<span class="cm-lhs">${lhs}</span> = ${toHTML(r)}`;
          plain.set(toText(r));
        }
      } catch (e) {
        msg.error(friendly(e.message));
      }
    }

    function solve(raw) {
      const eqs = raw.split(/\n|;/).map(s => s.trim()).filter(Boolean);
      const parsed = eqs.map(e => {
        const parts = e.split(/(?<![<>=!])=(?!=)/);
        if (parts.length > 2) throw new Error('One “=” per equation, please.');
        return M.parse(parts.length === 2 ? `(${parts[0]}) - (${parts[1]})` : parts[0]);
      });
      if (parsed.length > 1) return system(parsed);
      const node = parsed[0];
      const v = pickVar(node);
      const others = unknowns(M, node).filter(x => x !== v);
      if (others.length) throw new Error(`There are other letters (${others.join(', ')}). For a system, put one equation per line.`);
      const p = polyOf(M, node, v);
      if (p && p.coeffs.length > 1) {
        let roots = solvePoly(p.coeffs);
        if (p.den) {
          // Drop roots that make the denominator zero.
          const den = c => x => c.reduce((s, k) => s * x + k, 0);
          const d = den(p.den);
          roots = roots.filter(r => !r.real || Math.abs(d(r.value)) > 1e-9);
        }
        const deg = p.coeffs.length - 1;
        const real = roots.filter(r => r.real), cplx = roots.filter(r => !r.real);
        const line = r => `<div class="cm-root-line"><i>${esc(v)}</i> ${r.exact ? '=' : '≈'} ${esc(r.text).replace(/-/g, '−')}${r.exact && /√/.test(r.text) && r.real ? ` <span class="cm-approx">≈ ${fmtNum(r.value, 10)}</span>` : ''}</div>`;
        pretty.innerHTML = (real.length ? real.map(line).join('') : '<div class="cm-root-line">No real solutions</div>') +
          (cplx.length ? `<div class="cm-sub">Complex solutions</div>${cplx.map(line).join('')}` : '');
        plain.set([...real, ...cplx].map(r => `${v} ${r.exact ? '=' : '≈'} ${r.text}`).join(', ') || 'no solution');
        msg.info(`Polynomial of degree ${deg}${p.den ? ' (after clearing the fraction)' : ''}.${roots.some(r => !r.exact) ? ' Values with ≈ were found numerically.' : ''}`);
        return;
      }
      if (p && p.coeffs.length === 1) {
        const c = p.coeffs[0];
        pretty.innerHTML = Math.abs(c) < 1e-12 ? '<div class="cm-root-line">True for every value</div>' : '<div class="cm-root-line">No solution</div>';
        plain.set(Math.abs(c) < 1e-12 ? 'all values' : 'no solution');
        return;
      }
      // Anything else: look for sign changes numerically.
      const code = node.compile();
      const f = x => { const y = code.evaluate({ [v]: x }); return typeof y === 'number' ? y : NaN; };
      let roots = numericRoots(f, -100, 100, 20000);
      if (!roots.length) roots = numericRoots(f, -1e4, 1e4, 40000);
      roots = roots.map(r => +r.toPrecision(12)).sort((a, b) => a - b);
      const shown = roots.slice(0, 12);
      pretty.innerHTML = shown.length
        ? shown.map(r => `<div class="cm-root-line"><i>${esc(v)}</i> ≈ ${esc(fmtNum(r, 10)).replace(/-/g, '−')}</div>`).join('') + (roots.length > 12 ? `<div class="cm-sub">…and ${roots.length - 12} more</div>` : '')
        : '<div class="cm-root-line">No real solution found</div>';
      plain.set(shown.map(r => `${v} ≈ ${fmtNum(r, 10)}`).join(', '));
      msg.info('Not a polynomial, so it was solved numerically between −100 and 100 (then −10,000 to 10,000). Solutions outside that range, or where the graph only touches zero, can be missed — the Graph calculator shows the picture.');
    }

    function system(nodes) {
      const vars = [...new Set(nodes.flatMap(n => unknowns(M, n)))].sort();
      if (!vars.length) throw new Error('No unknowns found.');
      if (vars.length > 8) throw new Error('Up to 8 unknowns, please.');
      const codes = nodes.map(n => n.compile());
      const at = (c, vals) => { const y = c.evaluate(Object.fromEntries(vars.map((v, i) => [v, vals[i]]))); if (typeof y !== 'number') throw new Error('nonlinear'); return y; };
      const A = [], b = [];
      for (const c of codes) {
        const zero = vars.map(() => 0);
        const c0 = at(c, zero);
        const coef = vars.map((_, i) => at(c, zero.map((z, j) => (j === i ? 1 : 0))) - c0);
        // Check it really is linear at a couple of random points.
        for (let t = 0; t < 3; t++) {
          const pt = vars.map(() => Math.random() * 10 - 5);
          const lin = c0 + coef.reduce((s, k, i) => s + k * pt[i], 0);
          if (Math.abs(at(c, pt) - lin) > 1e-7 * Math.max(1, Math.abs(lin))) throw new Error('Only linear systems (no x², xy, sin x…) can be solved here.');
        }
        A.push(coef.map(k => +k.toPrecision(12))); b.push(+(-c0).toPrecision(12));
      }
      const r = solveLinear(M, A, b);
      if (r.none) { pretty.innerHTML = '<div class="cm-root-line">No solution — the equations contradict each other.</div>'; plain.set('no solution'); return; }
      if (r.many) { pretty.innerHTML = '<div class="cm-root-line">Infinitely many solutions — there are not enough independent equations.</div>'; plain.set('infinitely many solutions'); return; }
      const txt = r.x.map((f, i) => `${vars[i]} = ${f.toFraction()}`);
      pretty.innerHTML = r.x.map((f, i) => `<div class="cm-root-line"><i>${esc(vars[i])}</i> = ${esc(f.toFraction()).replace(/-/g, '−')}${f.d !== 1n ? ` <span class="cm-approx">≈ ${fmtNum(f.valueOf(), 10)}</span>` : ''}</div>`).join('');
      plain.set(txt.join(', '));
      msg.info(`Linear system: ${nodes.length} equations, ${vars.length} unknowns, solved exactly.`);
    }

    root.append(
      card(mode,
        field('Expression or equation', src, 'Write 5x for 5×x and x^2 for x². For a system, put one equation per line.'),
        row(field('Variable', vIn), orderField),
        h('div', {}, h('span', { class: 'field-label' }, 'Try'), ex)),
      card(h('h3', {}, 'Result'), loading, pretty, msg.el, plain.el),
      h('p', { class: 'field-hint' }, 'Built on math.js. It does not do integrals, inequalities or non-linear systems; factoring is over whole numbers and fractions.'));
    examples();
    on([src, vIn, order], run, 'input', 200);
    order.addEventListener('change', run);
    loadMath().then(m => { M = m.M; loading.remove(); run(); });
    if (incoming) textOf(incoming).then(t => { if (t) { src.value = t.trim(); run(); } });
  },
};

// ============================================================================
// 3. Graph calculator
// ============================================================================
const PLOT_COLOURS = ['#3a9cc4', '#e8a33d', '#d4577a', '#5aa96a', '#9a7bd6', '#e0764f'];

const graph = {
  id: 'calc-graph', name: 'Graph calculator', group: G, icon: 'chart-line',
  desc: 'Plot several functions, pan and pinch to zoom, trace points, and see roots and crossings.',
  keywords: 'graph plot function curve y= parametric roots intersection zoom chart desmos',
  accepts: ['text'],
  render(root, incoming) {
    const list = h('div', { class: 'cg-list' });
    const canvas = h('canvas', { class: 'cg-canvas', 'aria-label': 'Graph' });
    const wrapEl = h('div', { class: 'cg-wrap' }, canvas);
    const traceLine = h('div', { class: 'cg-trace mono' }, 'Point at the graph (or tap it) to trace.');
    const marks = h('table', { class: 'table cg-marks' });
    const tmin = numInput('0'), tmax = numInput('2pi');
    const msg = note();
    const loading = loadingNote();
    let M = null;
    let fns = []; // { inp, colour, kind, f, fx, fy, err }
    const view = { cx: 0, cy: 0, scale: 50 };
    let marksData = [];
    let trace = null; // { x } in maths units
    let W = 0, H = 0, dpr = 1;

    function addFn(text = '') {
      const colour = PLOT_COLOURS[fns.length % PLOT_COLOURS.length];
      const inp = input({ value: text, placeholder: 'e.g. sin(x)  or  cos(t), sin(t)' });
      inp.classList.add('mono');
      const item = { inp, colour };
      const rm = h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove', onclick: () => { fns = fns.filter(f => f !== item); el.remove(); compile(); } }, icon('x', 16));
      const el = h('div', { class: 'cg-fn' }, h('span', { class: 'cg-swatch', style: { background: colour } }), h('span', { class: 'cg-y' }, 'y ='), inp, rm);
      item.el = el;
      fns.push(item);
      list.append(el);
      inp.addEventListener('input', () => { compile(); });
      return item;
    }
    function compile() {
      if (!M) return;
      msg.clear();
      const bad = [];
      for (const f of fns) {
        f.f = f.fx = f.fy = null; f.inp.classList.remove('bad');
        let s = normalise(f.inp.value).trim().replace(/^(y|f\s*\(\s*x\s*\))\s*=/, '').trim();
        if (!s) continue;
        try {
          const parts = splitTop(s);
          if (parts.length === 2) {
            const a = M.compile(parts[0]), b = M.compile(parts[1]);
            f.kind = 'param';
            f.fx = t => toN(a.evaluate({ t })); f.fy = t => toN(b.evaluate({ t }));
            f.fx(0.5); f.fy(0.5);
          } else {
            const c = M.compile(s);
            f.kind = 'y';
            f.f = x => toN(c.evaluate({ x }));
            const test = c.evaluate({ x: 0.5 });
            if (typeof test === 'function') throw new Error('function');
          }
        } catch (e) { f.f = f.fx = f.fy = null; f.inp.classList.add('bad'); bad.push(f.inp.value); }
      }
      if (bad.length) msg.error(`Can't read: ${bad.join(', ')}`);
      findMarks(); draw();
    }
    const toN = v => (typeof v === 'number' ? v : v && v.isComplex && Math.abs(v.im) < 1e-12 ? v.re : NaN);
    function splitTop(s) {
      let depth = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === (s[0] === '(' && s.endsWith(')') ? 1 : 0)) {
          const outer = s[0] === '(' && s.endsWith(')') && depth === 1;
          return outer ? [s.slice(1, i), s.slice(i + 1, -1)] : [s.slice(0, i), s.slice(i + 1)];
        }
      }
      return [s];
    }

    const X = x => W / 2 + (x - view.cx) * view.scale;
    const Y = y => H / 2 - (y - view.cy) * view.scale;
    const ux = px => view.cx + (px - W / 2) / view.scale;
    const uy = py => view.cy - (py - H / 2) / view.scale;

    function colours() {
      const cs = getComputedStyle(root);
      return { bg: cs.getPropertyValue('--panel').trim() || '#251f1a', ink: cs.getPropertyValue('--ink').trim() || '#eee', ink3: cs.getPropertyValue('--ink-3').trim() || '#888', line: cs.getPropertyValue('--line').trim() || '#444' };
    }
    function niceStep() {
      const raw = 90 / view.scale;
      const p = 10 ** Math.floor(Math.log10(raw));
      for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
      return 10 * p;
    }
    const label = v => {
      const s = Math.abs(v) < 1e-12 ? '0' : fmtNum(+v.toPrecision(10), 8);
      return s.replace('-', '−');
    };

    function draw(target = canvas, scaleOut = dpr) {
      if (!W) return;
      const ctx = target.getContext('2d');
      const c = colours();
      ctx.setTransform(scaleOut, 0, 0, scaleOut, 0, 0);
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
      const step = niceStep();
      // grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.line;
      ctx.beginPath();
      for (let x = Math.ceil(ux(0) / step) * step; x <= ux(W); x += step) { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
      for (let y = Math.ceil(uy(H) / step) * step; y <= uy(0); y += step) { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
      ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
      // axes
      ctx.strokeStyle = c.ink3; ctx.lineWidth = 1.5; ctx.beginPath();
      const ax = Math.round(Y(0)) + 0.5, ay = Math.round(X(0)) + 0.5;
      if (ax >= 0 && ax <= H) { ctx.moveTo(0, ax); ctx.lineTo(W, ax); }
      if (ay >= 0 && ay <= W) { ctx.moveTo(ay, 0); ctx.lineTo(ay, H); }
      ctx.stroke();
      // labels
      ctx.fillStyle = c.ink3; ctx.font = '12px ui-monospace, Menlo, monospace';
      const lx = Math.min(Math.max(ax + 4, 4), H - 16);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let x = Math.ceil(ux(0) / step) * step; x <= ux(W); x += step) { if (Math.abs(x) < step / 2) continue; ctx.fillText(label(x), X(x), lx); }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const ly = Math.min(Math.max(ay + 5, 4), W - 50);
      for (let y = Math.ceil(uy(H) / step) * step; y <= uy(0); y += step) { if (Math.abs(y) < step / 2) continue; ctx.fillText(label(y), ly, Y(y)); }
      if (ax >= 0 && ax <= H && ay >= 0 && ay <= W) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', ay - 4, ax + 4); }
      // curves
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      for (const f of fns) {
        ctx.strokeStyle = f.colour; ctx.beginPath();
        if (f.f) {
          let pen = false, prev = null;
          for (let px = 0; px <= W; px += 1) {
            const y = f.f(ux(px));
            if (!Number.isFinite(y)) { pen = false; prev = null; continue; }
            const py = Y(y);
            if (prev != null && Math.abs(py - prev) > H * 1.5) pen = false;
            const cy = Math.max(-1e4, Math.min(1e4, py));
            if (pen) ctx.lineTo(px, cy); else ctx.moveTo(px, cy);
            pen = true; prev = py;
          }
        } else if (f.fx) {
          const a = evalExpr(tmin.value, 0), b = evalExpr(tmax.value, 2 * Math.PI);
          const n = 2000;
          let pen = false;
          for (let i = 0; i <= n; i++) {
            const t = a + (b - a) * i / n;
            const x = f.fx(t), y = f.fy(t);
            if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
            if (pen) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
            pen = true;
          }
        }
        ctx.stroke();
      }
      // roots and crossings
      for (const m of marksData) {
        ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 5, 0, 2 * Math.PI);
        ctx.fillStyle = c.bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = m.kind === 'root' ? m.colour : c.ink; ctx.stroke();
      }
      // trace
      if (trace && target === canvas) {
        const p = tracePoint(trace);
        if (p) {
          ctx.strokeStyle = c.ink3; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(p.x), 0); ctx.lineTo(X(p.x), H); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 6, 0, 2 * Math.PI); ctx.fillStyle = p.colour; ctx.fill();
          const t = `(${label(+p.x.toPrecision(6))}, ${label(+p.y.toPrecision(6))})`;
          ctx.font = '13px ui-monospace, Menlo, monospace';
          const tw = ctx.measureText(t).width + 12;
          let bx = X(p.x) + 10, by = Y(p.y) - 30;
          if (bx + tw > W) bx = X(p.x) - tw - 10;
          if (by < 4) by = Y(p.y) + 10;
          ctx.fillStyle = c.bg; ctx.globalAlpha = 0.9; ctx.fillRect(bx, by, tw, 22); ctx.globalAlpha = 1;
          ctx.strokeStyle = p.colour; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 21);
          ctx.fillStyle = c.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, bx + 6, by + 11);
          traceLine.textContent = `${p.src}:  x = ${label(+p.x.toPrecision(8))},  y = ${label(+p.y.toPrecision(8))}`;
        }
      }
    }
    function evalExpr(s, d) { try { const v = M.evaluate(normalise(s)); return typeof v === 'number' ? v : d; } catch { return d; } }
    function tracePoint(tr) {
      let best = null;
      for (const f of fns) {
        if (!f.f) continue;
        const y = f.f(tr.x);
        if (!Number.isFinite(y)) continue;
        const d = tr.py == null ? 0 : Math.abs(Y(y) - tr.py);
        if (!best || d < best.d) best = { x: tr.x, y, d, colour: f.colour, src: 'y = ' + f.inp.value.trim() };
      }
      return best;
    }

    function findMarks() {
      marksData = [];
      if (!W) return;
      const x0 = ux(0), x1 = ux(W);
      const ys = fns.filter(f => f.f);
      const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));
      ys.forEach(f => {
        for (const r of numericRoots(f.f, x0, x1, Math.max(400, Math.round(W)))) marksData.push({ kind: 'root', x: r, y: 0, colour: f.colour, who: [f] });
      });
      for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) {
        const a = ys[i], b = ys[j];
        for (const r of numericRoots(x => a.f(x) - b.f(x), x0, x1, Math.max(400, Math.round(W)))) {
          const y = a.f(r);
          if (Number.isFinite(y) && !(near(y, 0) && marksData.some(m => m.kind === 'root' && near(m.x, r)))) marksData.push({ kind: 'cross', x: r, y, colour: a.colour, who: [a, b] });
        }
      }
      marksData = marksData.slice(0, 40);
      const fmt = v => label(+(+v.toFixed(6)).toPrecision(10));
      marks.replaceChildren(
        h('tr', {}, h('th', {}, 'Point'), h('th', {}, 'x'), h('th', {}, 'y'), h('th', {}, 'Curve')),
        ...marksData.map(m => h('tr', {},
          h('td', {}, m.kind === 'root' ? 'Root' : 'Crossing'), h('td', {}, fmt(m.x)), h('td', {}, fmt(m.y)),
          h('td', { class: 'cg-who', title: m.who.map(f => 'y = ' + f.inp.value.trim()).join('  and  ') }, m.who.map(f => h('span', { class: 'cg-swatch', style: { background: f.colour } }))))));
      if (!marksData.length) marks.replaceChildren(h('tr', {}, h('td', { class: 'field-hint' }, 'No roots or crossings in view.')));
    }

    let raf = 0, markTimer = 0;
    const redraw = (marksToo = true) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => draw());
      if (marksToo) { clearTimeout(markTimer); markTimer = setTimeout(() => { findMarks(); draw(); }, 120); }
    };
    let sized = false;
    function resize() {
      const w = Math.round(wrapEl.clientWidth);
      if (!w) return;
      if (!sized) { sized = true; view.scale = Math.max(22, Math.min(50, w / 20)); }
      W = w; H = Math.round(Math.min(560, Math.max(300, w * 0.7)));
      dpr = Math.min(3, devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.height = H + 'px';
      findMarks(); draw();
    }

    // --- pan, zoom, pinch, trace ---
    const ptrs = new Map();
    let moved = 0, pinch = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      ptrs.set(e.pointerId, pos(e)); moved = 0;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: view.scale };
      }
    });
    canvas.addEventListener('pointermove', e => {
      const p = pos(e);
      if (!ptrs.has(e.pointerId)) {
        if (e.pointerType === 'mouse') { trace = { x: ux(p[0]), py: p[1] }; draw(); }
        return;
      }
      const last = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, p);
      if (ptrs.size === 1) {
        moved += Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]);
        view.cx -= (p[0] - last[0]) / view.scale; view.cy += (p[1] - last[1]) / view.scale;
        if (trace) trace = null;
        redraw();
      } else if (ptrs.size === 2 && pinch) {
        moved = 99;
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        zoomAt(mid, (pinch.scale * d / pinch.d) / view.scale);
      }
    });
    const up = e => {
      if (ptrs.has(e.pointerId) && ptrs.size === 1 && moved < 6) {
        const p = pos(e);
        trace = { x: ux(p[0]), py: p[1] }; draw();
      }
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) { trace = null; draw(); } });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoomAt(pos(e), Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
    }, { passive: false });
    function zoomAt([px, py], k) {
      const next = Math.min(1e7, Math.max(1e-4, view.scale * k));
      const x = ux(px), y = uy(py);
      view.scale = next;
      view.cx = x - (px - W / 2) / view.scale;
      view.cy = y + (py - H / 2) / view.scale;
      redraw();
    }
    const zoomBtn = (ic, k, lab) => h('button', { class: 'btn small', type: 'button', 'aria-label': lab, title: lab, onclick: () => zoomAt([W / 2, H / 2], k) }, icon(ic, 18));

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrapEl);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => draw();
    mq.addEventListener?.('change', onScheme);

    const pngBlob = () => new Promise(r => canvas.toBlob(r, 'image/png'));
    root.append(
      card(list,
        h('div', { class: 'row tight' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { addFn('').inp.focus(); } }, icon('plus', 16), ' Add function')),
        msg.el, loading),
      card(
        h('div', { class: 'row tight cg-tools' },
          zoomBtn('zoom-in', 1.5, 'Zoom in'), zoomBtn('zoom-out', 1 / 1.5, 'Zoom out'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { Object.assign(view, { cx: 0, cy: 0, scale: Math.max(22, Math.min(50, W / 20)) }); trace = null; redraw(); } }, icon('refresh-cw', 16), ' Reset view'),
          h('span', { class: 'cg-spacer' }),
          h('button', { class: 'btn small primary', type: 'button', onclick: async () => download('graph.png', await pngBlob()) }, icon('download', 16), ' PNG'),
          sendBtn(async () => ({ files: [await asFile(await pngBlob(), 'graph.png')] }))),
        wrapEl, traceLine),
      card(h('h3', {}, 'Roots and crossings in view'), marks),
      card(h('h3', {}, 'Parametric curves'),
        h('p', { class: 'field-hint' }, 'Write two expressions in t separated by a comma, e.g. cos(t), sin(t) for a circle. They are drawn for t from:'),
        row(field('t from', tmin), field('t to', tmax))),
      h('p', { class: 'field-hint' }, 'Drag to move, scroll or pinch to zoom. Roots and crossings are found numerically in the visible part, so zoom in for more digits.'));
    on([tmin, tmax], () => redraw(false), 'input', 150);

    for (const s of ['sin(x)', 'x^2/4 - 1']) addFn(s);
    loadMath().then(m => { M = m.M; loading.remove(); compile(); });
    if (incoming) textOf(incoming).then(t => { if (t) { fns[0].inp.value = t.trim().split('\n')[0]; compile(); } });
    resize();
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener?.('change', onScheme); cancelAnimationFrame(raf); clearTimeout(markTimer); };
  },
};

// ============================================================================
// 4. Unit converter
// ============================================================================
const units = {
  id: 'calc-units', name: 'Unit converter', group: G, icon: 'ruler',
  desc: 'Length, area, volume, weight, temperature, data, energy, cooking and more — every unit at once.',
  keywords: 'unit converter convert metric imperial length weight mass temperature celsius fahrenheit data gib mb cups grams kati tahil ela relong ekar acre fuel mpg pressure psi',
  render(root) {
    const catSel = select(CATEGORIES.map(c => [c.id, c.name]), 'length');
    const val = numInput('1');
    const from = select([]), to = select([]);
    const ingr = select(INGREDIENTS.map(([id, name]) => [id, name]), 'flour');
    const ingrField = field('Ingredient', ingr, 'Weights per cup are typical values — real ones vary with how you scoop.');
    const say = h('p', { class: 'big-say' });
    const table = h('table', { class: 'table cu-all' });
    const msg = note();
    const swap = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Swap units', title: 'Swap', onclick: () => { const a = from.value; from.value = to.value; to.value = a; run(); } }, icon('arrow-left-right', 18));
    const cat = () => CATEGORIES.find(c => c.id === catSel.value);
    const DEFAULT_TO = { length: 'ft', area: 'ft2', volume: 'gal', mass: 'lb', temp: 'f', speed: 'mph', time: 'h', data: 'MiB', energy: 'kcal', power: 'hp', pressure: 'psi', angle: 'rad', fuel: 'kml', cooking: 'g' };
    const DEFAULT_FROM = { length: 'm', area: 'm2', volume: 'l', mass: 'kg', temp: 'c', speed: 'kmh', time: 'min', data: 'GB', energy: 'kJ', power: 'kW', pressure: 'bar', angle: 'deg', fuel: 'l100', cooking: 'cup' };

    function fill() {
      const c = cat();
      const opts = c.units.map(u => h('option', { value: u[0] }, u[1]));
      from.replaceChildren(...opts);
      to.replaceChildren(...opts.map(o => o.cloneNode(true)));
      from.value = DEFAULT_FROM[c.id]; to.value = DEFAULT_TO[c.id];
      ingrField.hidden = !c.cooking;
    }
    const show = v => (Number.isFinite(v) ? groupNum(v, 10) : '—');
    function run() {
      const c = cat();
      if (from.selectedIndex < 0 || !c.units.some(u => u[0] === from.value)) fill();
      ingrField.hidden = !c.cooking;
      msg.clear();
      const x = num(val.value);
      const dens = c.cooking ? densityOf(ingr.value) : 1;
      if (!Number.isFinite(x)) { say.textContent = ''; table.replaceChildren(); if (val.value.trim()) msg.error('Type a number.'); return; }
      const name = id => c.units.find(u => u[0] === id)[1];
      const r = convert(c, x, from.value, to.value, dens);
      say.textContent = `${groupNum(x, 10)} ${name(from.value)} = ${show(+r.toPrecision(Math.min(15, Math.max(6, Math.ceil(Math.log10(Math.abs(r) + 1))))))} ${name(to.value)}`;
      table.replaceChildren(...c.units.map(u => {
        const v = convert(c, x, from.value, u[0], dens);
        const tr = h('tr', { class: u[0] === to.value ? 'on' : '', title: 'Tap to copy', onclick: () => Number.isFinite(v) && copy(fmtNum(v, 12)) },
          h('th', {}, u[1]), h('td', {}, show(v)));
        return tr;
      }));
      if (c.id === 'temp' && convert(c, x, from.value, 'k') < 0) msg.error('That is below absolute zero.');
      if (c.cooking) msg.info('Cup ↔ gram figures are approximate: they assume a typical density for the ingredient.');
    }
    catSel.addEventListener('change', () => { fill(); run(); });
    root.append(
      card(
        row(field('What', catSel), ingrField),
        row(field('Value', val), field('From', from), h('div', { class: 'cu-swap' }, swap), field('To', to)),
        say, msg.el),
      card(h('h3', {}, 'In every unit'), table),
      h('p', { class: 'field-hint' }, 'Malaysian units: 1 kati = 1⅓ lb (604.79 g) and 16 tahil = 1 kati, as in the Weights and Measures Act; 1 ela = 1 yard; 1 relong = 30,976 sq ft (about 0.71 acre — the usual Kedah/Penang mainland measure; some old grants differ); ekar is the acre; 1 gantang = 1 imperial gallon. Data: kB/MB/GB count in 1000s, KiB/MiB/GiB in 1024s.'));
    fill();
    on([val, from, to, ingr], run, 'input');
    for (const s of [from, to, ingr]) s.addEventListener('change', run);
  },
};

// ============================================================================
// 5. Time zones & date maths
// ============================================================================
const zoneName = tz => CITIES.find(c => c[1] === tz)?.[0] || tz.split('/').pop().replace(/_/g, ' ');
const two = n => String(n).padStart(2, '0');

const timeTool = {
  id: 'calc-time', name: 'Time zones & date maths', group: G, icon: 'clock-4',
  desc: 'Several cities on one slider, a meeting planner, and days, weekdays and working days between dates.',
  keywords: 'time zone world clock meeting planner date difference days between working days add days business days weekend duration age',
  render(root) {
    const mode = tabs([['zones', 'Time zones'], ['between', 'Between dates'], ['add', 'Add to a date']], 'zones', show);
    const panes = {};

    // ---------------- zones ----------------
    let zones = store.get('zones', ['Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York']).filter(validZone);
    if (!zones.length) zones = ['Asia/Kuala_Lumpur'];
    const homeNow = () => wall(Date.now(), zones[0]);
    const hn = homeNow();
    const day = input({ type: 'date', value: `${hn.y}-${two(hn.m)}-${two(hn.d)}` });
    const slider = h('input', { type: 'range', min: 0, max: 1439, step: 15, value: hn.h * 60 + Math.floor(hn.mi / 15) * 15, class: 'ct-slider', 'aria-label': 'Time of day' });
    const sliderOut = h('strong', { class: 'ct-slider-out' });
    const zoneList = h('div', { class: 'ct-zones' });
    const addIn = input({ placeholder: 'City or zone, e.g. Tokyo' });
    const dl = h('datalist', { id: 'ct-zone-list' },
      CITIES.map(([n, tz]) => h('option', { value: n })),
      (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []).map(tz => h('option', { value: tz })));
    addIn.setAttribute('list', 'ct-zone-list');
    const addMsg = note();
    const workFrom = select([...Array(24).keys()].map(i => [String(i), `${two(i)}:00`]), '9');
    const workTo = select([...Array(24).keys()].map(i => [String(i + 1), `${two(i + 1)}:00`]), '17');
    const planner = h('div', { class: 'ct-planner' });
    const overlap = h('p', { class: 'big-say ct-overlap' });

    const instant = () => {
      const d = parseDate(day.value) || homeNow();
      const mins = +slider.value;
      return zoned(d.y, d.m, d.d, Math.floor(mins / 60), mins % 60, zones[0]);
    };
    function addZone() {
      const q = addIn.value.trim();
      if (!q) return;
      const city = CITIES.find(c => c[0].toLowerCase() === q.toLowerCase());
      const tz = city ? city[1] : q;
      if (!validZone(tz)) { addMsg.error('Unknown city — pick one from the list, or type a zone like Asia/Tokyo.'); return; }
      addMsg.clear();
      if (!zones.includes(tz)) zones.push(tz);
      store.set('zones', zones); addIn.value = ''; drawZones();
    }
    addIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addZone(); } });
    addIn.addEventListener('change', () => { if (CITIES.some(c => c[0] === addIn.value) || (addIn.value.includes('/') && validZone(addIn.value))) addZone(); });

    function drawZones() {
      const t = instant();
      const home = wall(t, zones[0]);
      const homeDay = dayNum(home);
      sliderOut.textContent = `${two(home.h)}:${two(home.mi)} in ${zoneName(zones[0])}`;
      zoneList.replaceChildren(...zones.map((tz, i) => {
        const w = wall(t, tz);
        const dd = dayNum(w) - homeDay;
        const off = offsetMin(t, tz);
        return h('div', { class: 'ct-zone' + (i === 0 ? ' home' : '') },
          h('div', { class: 'ct-z-name' }, h('strong', {}, zoneName(tz)), h('span', {}, `${offsetText(off)}${i === 0 ? ' · home' : ''}`)),
          h('div', { class: 'ct-z-time mono' }, `${two(w.h)}:${two(w.mi)}`),
          h('div', { class: 'ct-z-day' }, new Date(Date.UTC(w.y, w.m - 1, w.d)).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }), dd ? h('em', {}, dd > 0 ? ` +${dd} day` : ` ${dd} day`) : null),
          h('div', { class: 'ct-z-btns' },
            i > 0 && h('button', { class: 'btn small ghost', type: 'button', title: 'Make this the home zone', onclick: () => { zones.splice(i, 1); zones.unshift(tz); store.set('zones', zones); const w2 = wall(t, tz); day.value = `${w2.y}-${two(w2.m)}-${two(w2.d)}`; slider.value = w2.h * 60 + Math.floor(w2.mi / 15) * 15; drawZones(); } }, 'Home'),
            zones.length > 1 && h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove ' + zoneName(tz), onclick: () => { zones.splice(i, 1); store.set('zones', zones); drawZones(); } }, icon('x', 16))));
      }));
      drawPlanner();
    }
    function drawPlanner() {
      const d = parseDate(day.value) || homeNow();
      const a = +workFrom.value, b = +workTo.value;
      const hours = [...Array(24).keys()].map(hh => zoned(d.y, d.m, d.d, hh, 0, zones[0]));
      const cur = Math.floor(+slider.value / 60);
      const state = hours.map(t => zones.map(tz => {
        const w = wall(t, tz);
        const local = w.h + w.mi / 60;
        const wd = weekday(w);
        return { h: w.h, mi: w.mi, work: local >= a && local < b && wd !== 0 && wd !== 6, awake: local >= 7 && local < 23 };
      }));
      const all = state.map(s => s.every(z => z.work));
      planner.replaceChildren(h('div', { class: 'ct-grid', style: { gridTemplateColumns: `minmax(90px, max-content) repeat(24, minmax(26px, 1fr))` } },
        ...zones.flatMap((tz, zi) => [
          h('div', { class: 'ct-g-name' }, zoneName(tz)),
          ...state.map((s, hh) => h('button', {
            type: 'button', class: 'ct-cell ' + (s[zi].work ? 'work' : s[zi].awake ? 'awake' : 'night') + (hh === cur ? ' cur' : ''),
            title: `${zoneName(tz)} ${two(s[zi].h)}:${two(s[zi].mi)}`,
            onclick: () => { slider.value = hh * 60; drawZones(); },
          }, String(s[zi].h))),
        ]),
        h('div', { class: 'ct-g-name' }, 'Everyone working'),
        ...all.map((ok, hh) => h('div', { class: 'ct-cell ' + (ok ? 'both' : 'none') + (hh === cur ? ' cur' : '') }, ok ? '✓' : ''))));
      const runs = [];
      all.forEach((ok, hh) => { if (ok) { if (runs.length && runs[runs.length - 1][1] === hh) runs[runs.length - 1][1] = hh + 1; else runs.push([hh, hh + 1]); } });
      overlap.textContent = zones.length < 2 ? 'Add another city to plan a meeting.'
        : runs.length ? `Everyone is in working hours ${runs.map(([x, y]) => `${two(x)}:00–${two(y)}:00`).join(' and ')} (${zoneName(zones[0])} time).`
          : 'No hour on this day when everyone is in working hours — look for the lightest column.';
    }
    on([day, slider, workFrom, workTo], drawZones, 'input');
    workFrom.addEventListener('change', drawZones); workTo.addEventListener('change', drawZones);
    const nowBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { const w = homeNow(); day.value = `${w.y}-${two(w.m)}-${two(w.d)}`; slider.value = w.h * 60 + Math.floor(w.mi / 15) * 15; drawZones(); } }, 'Now');
    panes.zones = h('div', { class: 'stack' },
      card(row(field('Day (home zone)', day), h('div', { class: 'cu-swap' }, nowBtn)),
        h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, 'Time'), sliderOut), slider),
        zoneList,
        row(field('Add a city', addIn), h('div', { class: 'cu-swap' }, h('button', { class: 'btn small primary', type: 'button', onclick: addZone }, icon('plus', 16), ' Add'))), dl, addMsg.el),
      card(h('h3', {}, 'Meeting planner'),
        row(field('Work starts', workFrom), field('Work ends', workTo)),
        overlap, planner,
        h('p', { class: 'field-hint' }, 'Columns are hours in the home zone; numbers are local hours. Green = working hours (Mon–Fri), yellow = awake, dark = night.')));

    // ---------------- weekend & holidays (shared) ----------------
    const wkBoxes = DAY_NAMES.map((n, i) => checkbox(n.slice(0, 3), i === 0 || i === 6));
    const hols = textarea({ rows: 3, placeholder: 'Public holidays to skip, one per line: 2026-08-31' });
    const weekendSet = () => new Set(wkBoxes.map((b, i) => (b.input.checked ? i : -1)).filter(i => i >= 0));
    const holidaySet = () => new Set(hols.value.split(/[\s,]+/).map(parseDate).filter(Boolean).map(dayNum));
    const weekendCard = card(h('h3', {}, 'Weekend & holidays'),
      h('div', { class: 'checks ct-week' }, wkBoxes),
      h('p', { class: 'field-hint' }, 'Most of Malaysia rests Saturday and Sunday. Kedah, Kelantan and Terengganu rest Friday and Saturday — tick those instead.'),
      field('Holidays (optional)', hols));

    // ---------------- between ----------------
    const t0 = fromDayNum(dayNum(homeNow()));
    const aIn = input({ type: 'date', value: iso(t0) });
    const bIn = input({ type: 'date', value: iso(addYMD(t0, 0, 3, 0)) });
    const incl = checkbox('Count the end date too', false);
    const bSay = h('p', { class: 'big-say' });
    const bKv = h('dl', { class: 'kv ct-kv' });
    function between() {
      const a = parseDate(aIn.value), b = parseDate(bIn.value);
      bKv.replaceChildren();
      if (!a || !b) { bSay.textContent = ''; return; }
      const span = ymd(a, b);
      const total = dayNum(b) - dayNum(a);
      const wk = workingDays(a, b, weekendSet(), holidaySet(), incl.input.checked);
      const parts = [[span.y, 'year'], [span.m, 'month'], [span.d, 'day']].filter(([n]) => n).map(([n, u]) => `${n} ${u}${n === 1 ? '' : 's'}`);
      bSay.textContent = total === 0 ? 'Same day' : `${span.sign < 0 ? 'Back ' : ''}${parts.join(', ')}`;
      const absDays = Math.abs(total) + (incl.input.checked ? 1 : 0);
      const add = (k, v) => bKv.append(h('dt', {}, k), h('dd', {}, v));
      add('Total days', groupNum(absDays));
      add('Weeks', `${Math.floor(absDays / 7)} weeks ${absDays % 7 ? `and ${absDays % 7} day${absDays % 7 === 1 ? '' : 's'}` : ''}`);
      add('Weekdays (Mon–Fri)', groupNum(Math.abs(wk.weekdays)));
      add('Working days', `${groupNum(Math.abs(wk.work))}${wk.holidays ? ` (${wk.holidays} holiday${wk.holidays === 1 ? '' : 's'} skipped)` : ''}`);
      add('Hours', groupNum(absDays * 24));
      add('Start', longDate(a));
      add('End', longDate(b));
    }
    on([aIn, bIn, incl.input, hols], between, 'input');
    for (const b of wkBoxes) b.input.addEventListener('change', () => { between(); addCalc(); });
    incl.input.addEventListener('change', between);
    panes.between = card(row(field('From', aIn), field('To', bIn)), incl, bSay, bKv,
      h('p', { class: 'field-hint' }, 'By default the end date is not counted (1 Jan → 2 Jan is 1 day). Working days use the weekend and holidays below.'));

    // ---------------- add ----------------
    const sIn = input({ type: 'date', value: iso(t0) });
    const sTime = input({ type: 'time', value: '' });
    const sign = tabs([['+', 'Add'], ['-', 'Subtract']], '+', () => addCalc());
    const nums = Object.fromEntries(['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'working days'].map(k => [k, numInput('', '0')]));
    nums.days.value = '30';
    const aSay = h('p', { class: 'big-say' });
    const aKv = h('dl', { class: 'kv ct-kv' });
    function addCalc() {
      const s = parseDate(sIn.value);
      aKv.replaceChildren();
      if (!s) { aSay.textContent = ''; return; }
      const k = sign.value === '-' ? -1 : 1;
      const n = key => Math.trunc(num(nums[key].value) || 0) * k;
      let d = addYMD(s, n('years'), n('months'), n('weeks') * 7 + n('days'));
      const [hh, mm] = (sTime.value || '00:00').split(':').map(Number);
      let mins = hh * 60 + mm + n('hours') * 60 + n('minutes');
      const carry = Math.floor(mins / 1440);
      mins -= carry * 1440;
      d = fromDayNum(dayNum(d) + carry);
      if (n('working days')) d = addWorkingDays(d, n('working days'), weekendSet(), holidaySet());
      const timeShown = sTime.value || n('hours') || n('minutes');
      aSay.textContent = longDate(d) + (timeShown ? `, ${two(Math.floor(mins / 60))}:${two(mins % 60)}` : '');
      const add = (key, v) => aKv.append(h('dt', {}, key), h('dd', {}, v));
      add('ISO date', iso(d) + (timeShown ? `T${two(Math.floor(mins / 60))}:${two(mins % 60)}` : ''));
      add('Days from start', groupNum(dayNum(d) - dayNum(s)));
      add('Day of the week', DAY_NAMES[weekday(d)]);
    }
    on([sIn, sTime, ...Object.values(nums)], addCalc, 'input');
    panes.add = card(row(field('Start date', sIn), field('Time (optional)', sTime)), sign,
      h('div', { class: 'ct-nums' }, Object.entries(nums).map(([k, el]) => field(k[0].toUpperCase() + k.slice(1), el))),
      aSay, aKv,
      h('p', { class: 'field-hint' }, 'Months are added on the calendar: 31 January + 1 month = 28 or 29 February. Working days skip the weekend and holidays below.'));

    function show() {
      for (const [k, el] of Object.entries(panes)) el.hidden = mode.value !== k;
      weekendCard.hidden = mode.value === 'zones';
    }
    root.append(mode, panes.zones, panes.between, panes.add, weekendCard,
      h('p', { class: 'field-hint' }, 'Time zone rules come from this device\'s browser, so daylight saving is handled.'));
    show(); drawZones(); between(); addCalc();
  },
};

// ============================================================================
// 6. Stupid units
// ============================================================================
const silly = {
  id: 'calc-silly', name: 'Stupid units', group: G, icon: 'banana',
  desc: 'How many bananas, Proton Sagas, Olympic pools or blue whales is that? Real reference values.',
  keywords: 'silly fun units bananas olympic pools eiffel tower football pitch bus blue whale petronas proton saga',
  render(root) {
    const val = numInput('100');
    const unitSel = h('select', { class: 'input' },
      Object.entries(SILLY_INPUT).map(([q, ids]) => {
        const cat = CATEGORIES.find(c => c.id === q);
        return h('optgroup', { label: cat.name }, ids.map(id => h('option', { value: `${q}:${id}` }, cat.units.find(u => u[0] === id)[1])));
      }));
    unitSel.value = 'length:m';
    const out = h('div', { class: 'cx-grid' });
    const notes = h('ol', { class: 'cx-notes' });
    const nice = v => {
      if (!Number.isFinite(v)) return '—';
      if (v >= 1e6) return groupNum(+v.toPrecision(3));
      if (v >= 100) return groupNum(Math.round(v));
      if (v >= 0.01) return fmtNum(+v.toPrecision(3));
      return fmtNum(v, 3);
    };
    function run() {
      const [q, id] = unitSel.value.split(':');
      const cat = CATEGORIES.find(c => c.id === q);
      const x = num(val.value);
      out.replaceChildren(); notes.replaceChildren();
      if (!Number.isFinite(x)) return;
      const baseId = { length: 'm', area: 'm2', volume: 'l', mass: 'kg', time: 's' }[q];
      const base = convert(cat, x, id, baseId);
      SILLY[q].forEach(([key, name, size, src], i) => {
        const n = base / size;
        out.append(h('div', { class: 'cx-card', 'data-k': key },
          h('strong', {}, nice(n)), h('span', {}, name, h('sup', {}, String(i + 1)))));
        notes.append(h('li', {}, src));
      });
    }
    on([val, unitSel], run, 'input');
    unitSel.addEventListener('change', run);
    root.append(
      card(row(field('Amount', val), field('Unit', unitSel)), out),
      card(h('h3', {}, 'Where the numbers come from'), notes,
        h('p', { class: 'field-hint' }, 'Bananas, durians and whales come in many sizes — these are typical values, rounded. For fun, not for engineering.')));
  },
};

// ============================================================================
// 7. Percentage & ratio
// ============================================================================
const TAX = [
  ['8', 'Service tax 8% (most services)'], ['6', 'Service tax 6% (F&B, telco, parking, logistics)'],
  ['10', 'Sales tax 10%'], ['5', 'Sales tax 5%'], ['6g', 'GST 6% (ended 31 May 2018)'], ['custom', 'Other rate…'],
];
const money = v => (Number.isFinite(v) ? 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const pc = v => (Number.isFinite(v) ? fmtNum(+v.toPrecision(10), 10) : '—');

const percent = {
  id: 'calc-percent', name: 'Percentage & ratio', group: G, icon: 'percent',
  desc: 'X% of Y, percentage change, SST, discounts, aspect ratios and splitting the bill.',
  keywords: 'percent percentage ratio sst gst tax discount sale aspect ratio 16:9 tip split bill service charge increase decrease',
  render(root) {
    const block = (title, inputs, out, extra) => card(h('h3', {}, title), row(...inputs), out, extra);
    const big = () => h('p', { class: 'big-say' });

    // X% of Y
    const p1 = numInput('15'), y1 = numInput('80'), o1 = big();
    on([p1, y1], () => { const r = num(p1.value) / 100 * num(y1.value); o1.textContent = Number.isFinite(r) ? `${pc(num(p1.value))}% of ${pc(num(y1.value))} = ${pc(r)}` : ''; });
    // X is what % of Y
    const x2 = numInput('30'), y2 = numInput('120'), o2 = big();
    on([x2, y2], () => { const r = num(x2.value) / num(y2.value) * 100; o2.textContent = Number.isFinite(r) ? `${pc(num(x2.value))} is ${pc(+r.toFixed(6))}% of ${pc(num(y2.value))}` : ''; });
    // change
    const a3 = numInput('80'), b3 = numInput('100'), o3 = big();
    on([a3, b3], () => {
      const a = num(a3.value), b = num(b3.value), r = (b - a) / Math.abs(a) * 100;
      o3.textContent = Number.isFinite(r) ? `${r >= 0 ? '+' : '−'}${pc(Math.abs(+r.toFixed(6)))}% (${r >= 0 ? 'up' : 'down'} by ${pc(Math.abs(b - a))})` : '';
    });

    // SST
    const amt = numInput('100'), rate = select(TAX, '8'), custom = numInput('', 'rate %');
    const customField = field('Rate %', custom);
    const dir = tabs([['add', 'Price before tax'], ['remove', 'Price includes tax']], 'add', () => sst());
    const o4 = big(), kv4 = h('dl', { class: 'kv' });
    function sst() {
      customField.hidden = rate.value !== 'custom';
      const r = (rate.value === 'custom' ? num(custom.value) : parseFloat(rate.value)) / 100;
      const x = num(amt.value);
      kv4.replaceChildren();
      if (!Number.isFinite(x) || !Number.isFinite(r)) { o4.textContent = ''; return; }
      const before = dir.value === 'add' ? x : x / (1 + r);
      const tax = before * r, total = before + tax;
      o4.textContent = dir.value === 'add' ? `Total ${money(total)}` : `Before tax ${money(before)}`;
      kv4.append(h('dt', {}, 'Before tax'), h('dd', {}, money(before)), h('dt', {}, `Tax (${pc(r * 100)}%)`), h('dd', {}, money(tax)), h('dt', {}, 'Total'), h('dd', {}, money(total)));
    }
    on([amt, custom], sst); rate.addEventListener('change', sst);

    // discount
    const price = numInput('250'), d1 = numInput('30'), d2 = numInput('', '0');
    const o5 = big(), kv5 = h('dl', { class: 'kv' });
    on([price, d1, d2], () => {
      const p = num(price.value), a = (num(d1.value) || 0) / 100, b = (num(d2.value) || 0) / 100;
      kv5.replaceChildren();
      if (!Number.isFinite(p)) { o5.textContent = ''; return; }
      const fin = p * (1 - a) * (1 - b);
      o5.textContent = `You pay ${money(fin)}`;
      kv5.append(h('dt', {}, 'You save'), h('dd', {}, money(p - fin)), h('dt', {}, 'Total discount'), h('dd', {}, `${pc(+((1 - fin / p) * 100).toFixed(4))}%`));
      if (b) kv5.append(h('dt', {}, 'Note'), h('dd', {}, `${pc(a * 100)}% + ${pc(b * 100)}% is not ${pc((a + b) * 100)}% off`));
    });

    // ratio
    const rw = numInput('16'), rh = numInput('9'), kw = numInput('1280'), kh = numInput('', 'or a height');
    const o6 = big();
    let lastRatio = 'w';
    kw.addEventListener('input', () => { lastRatio = 'w'; kh.value = ''; });
    kh.addEventListener('input', () => { lastRatio = 'h'; kw.value = ''; });
    const sw = numInput('1920'), sh = numInput('1080'), o7 = big();
    on([rw, rh, kw, kh], () => {
      const a = num(rw.value), b = num(rh.value);
      if (!(a > 0 && b > 0)) { o6.textContent = ''; return; }
      if (lastRatio === 'w' && Number.isFinite(num(kw.value))) o6.textContent = `${pc(num(kw.value))} × ${pc(+(num(kw.value) * b / a).toFixed(4))}`;
      else if (Number.isFinite(num(kh.value))) o6.textContent = `${pc(+(num(kh.value) * a / b).toFixed(4))} × ${pc(num(kh.value))}`;
      else o6.textContent = '';
    });
    on([sw, sh], () => {
      const a = num(sw.value), b = num(sh.value);
      if (!(a > 0 && b > 0)) { o7.textContent = ''; return; }
      const sc = 10 ** Math.max(...[a, b].map(v => (String(v).split('.')[1] || '').length));
      const A = Math.round(a * sc), B = Math.round(b * sc);
      const g = (x, y) => (y ? g(y, x % y) : x);
      const k = g(A, B);
      o7.textContent = `${A / k} : ${B / k}  (${pc(+(a / b).toFixed(4))} : 1)`;
    });

    // bill
    const bill = numInput('180'), svc = numInput('10'), tip = numInput('0'), ppl = numInput('4');
    const o8 = big(), kv8 = h('dl', { class: 'kv' });
    on([bill, svc, tip, ppl], () => {
      const b = num(bill.value), s = (num(svc.value) || 0) / 100, t = (num(tip.value) || 0) / 100, n = Math.max(1, Math.round(num(ppl.value) || 1));
      kv8.replaceChildren();
      if (!Number.isFinite(b)) { o8.textContent = ''; return; }
      const total = b * (1 + s) * (1 + t);
      const each = total / n;
      o8.textContent = `${money(each)} each`;
      kv8.append(h('dt', {}, 'Service charge'), h('dd', {}, money(b * s)), h('dt', {}, 'Tip'), h('dd', {}, money(b * (1 + s) * t)), h('dt', {}, 'Total'), h('dd', {}, money(total)),
        h('dt', {}, 'Each, rounded to 5 sen'), h('dd', {}, money(Math.ceil(each * 20 - 1e-9) / 20)));
    });

    root.append(h('div', { class: 'grid2' },
      block('What is X% of Y?', [field('Percent', p1), field('Of', y1)], o1),
      block('X is what % of Y?', [field('X', x2), field('Y', y2)], o2),
      block('Percentage change', [field('From', a3), field('To', b3)], o3),
      card(h('h3', {}, 'SST (sales and service tax)'), dir, row(field('Amount (RM)', amt), field('Rate', rate), customField), o4, kv4,
        h('p', { class: 'field-hint' }, 'Rates since 1 July 2025: sales tax 5% or 10%; service tax 8% for most services, 6% for food and drink, telecoms, parking and logistics. Check what your receipt says.')),
      block('Discount', [field('Price', price), field('Discount %', d1), field('Extra % off', d2)], o5, kv5),
      card(h('h3', {}, 'Bill & tip'), row(field('Bill', bill), field('Service %', svc)), row(field('Tip %', tip), field('People', ppl)), o8, kv8),
      card(h('h3', {}, 'Scale a ratio'), row(field('Ratio W', rw), field('Ratio H', rh)), row(field('Width', kw), field('Height', kh)), o6),
      card(h('h3', {}, 'Simplify a ratio'), row(field('Width', sw), field('Height', sh)), o7)));
    sst();
  },
};

export default [sci, algebra, graph, units, timeTool, silly, percent];
