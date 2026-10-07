// Known-answer checks for the Calculators drawer (js/tools/calc.js).
import { set, val, wait, until } from '../helpers.mjs';

const txt = sel => `(document.querySelector('${sel}')?.textContent || '')`;
const ready = until(`!document.querySelector('.cs-loading')`, 10000);
const clickText = (sel, t) => `[...document.querySelectorAll('${sel}')].find(b => b.textContent.trim() === ${JSON.stringify(t)}).click()`;
const tab = t => clickText('.tabs button', t);

export default {
  'calc-sci': [ready,
    set('.cs-expr', 'sin(30)'), `(${txt('.cs-result')} === '= 0.5' ? '' : 'sin(30) in degrees: ' + ${txt('.cs-result')})`,
    set('.cs-expr', 'sin(30 deg)'), `(${txt('.cs-result')} === '= 0.5' ? '' : 'sin(30 deg): ' + ${txt('.cs-result')})`,
    set('.cs-expr', '2^10'), `(${txt('.cs-result')} === '= 1024' ? '' : '2^10: ' + ${txt('.cs-result')})`,
    set('.cs-expr', '1/3 + 1/6'), `(${txt('.cs-exact')} === 'exactly 1/2' ? '' : 'fraction: ' + ${txt('.cs-exact')})`,
    // keypad: 7 × 6 = then + 8 = uses Ans
    set('.cs-expr', ''), clickText('.cs-key', '7'), clickText('.cs-key', '×'), clickText('.cs-key', '6'), clickText('.cs-key', '='),
    clickText('.cs-key', '+'), clickText('.cs-key', '8'), clickText('.cs-key', '='),
    `(${txt('.cs-result')} === '= 50' && ${val('.cs-expr')} === 'Ans+8' ? '' : 'keypad Ans: ' + ${val('.cs-expr')} + ' ' + ${txt('.cs-result')})`,
    `(document.querySelectorAll('.cs-hist li').length >= 2 ? '' : 'history empty')`,
    tab('Radians'), set('.cs-expr', 'cos(pi)'), `(${txt('.cs-result')} === '= -1' ? '' : 'cos(pi) rad: ' + ${txt('.cs-result')})`, tab('Degrees')],

  'calc-algebra': [until(`!document.querySelector('.cs-loading')`, 10000), wait(400),
    `(${val('.output input')} === 'x = 2, x = 3' ? '' : 'solve quadratic: ' + ${val('.output input')})`,
    tab('Derivative'), set('textarea', 'x^3'), wait(300), `(${val('.output input')} === '3 * x^2' ? '' : 'd/dx x^3: ' + ${val('.output input')})`,
    tab('Factor'), set('textarea', '6x^2 - x - 2'), wait(300), `(${val('.output input')}.replace(/\\s/g, '') === '(2x+1)(3x-2)' ? '' : 'factor: ' + ${val('.output input')})`,
    tab('Expand'), set('textarea', '(x + 1)^2'), wait(300), `(${val('.output input')} === 'x^2 + 2 * x + 1' ? '' : 'expand: ' + ${val('.output input')})`,
    tab('Solve'), set('textarea', 'x + y = 10\nx - y = 2'), wait(300), `(${val('.output input')} === 'x = 6, y = 4' ? '' : 'system: ' + ${val('.output input')} + ' / ' + ${val('textarea')} + ' / ' + ${txt('.note')})`,
    set('textarea', 'x^2 = 2'), wait(300), `(${val('.output input')} === 'x = -√2, x = √2' ? '' : 'surd: ' + ${val('.output input')})`],

  'calc-graph': [until(`!document.querySelector('.cs-loading')`, 10000), wait(300),
    set('.cg-fn input', 'x^2 - 4', 0), set('.cg-fn input', '', 1), wait(400),
    `(() => { const rows = [...document.querySelectorAll('.cg-marks tr')].slice(1).map(r => r.children[1].textContent); return rows.includes('−2') && rows.includes('2') ? '' : 'roots of x^2-4: ' + rows.join(','); })()`,
    set('.cg-fn input', 'x', 1), wait(400),
    `(document.querySelector('.cg-marks').textContent.includes('Crossing') ? '' : 'no crossing found')`,
    `(() => { const c = document.querySelector('.cg-canvas'), r = c.getBoundingClientRect(); const o = { clientX: r.left + r.width / 2 + 40, clientY: r.top + r.height / 2, pointerId: 7, pointerType: 'touch', bubbles: true }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); const t = document.querySelector('.cg-trace').textContent; return /x = [\\d.]+,\\s+y = /.test(t) ? '' : 'trace: ' + t; })()`,
    `(() => { const c = document.querySelector('.cg-canvas'); return c.width > 100 && c.toDataURL().length > 5000 ? '' : 'canvas blank'; })()`],

  'calc-units': [
    `(() => { const s = document.querySelectorAll('select'); s[0].value = 'temp'; s[0].dispatchEvent(new Event('change')); })()`,
    `(() => { const s = document.querySelectorAll('select'); s[2].value = 'f'; s[3].value = 'c'; s[2].dispatchEvent(new Event('change')); })()`,
    set('input.input', '100', 0),
    `(${txt('.big-say')}.includes('= 37.7778 Celsius') ? '' : '100F: ' + ${txt('.big-say')})`,
    `(() => { const s = document.querySelectorAll('select'); s[0].value = 'data'; s[0].dispatchEvent(new Event('change')); s[2].value = 'GiB'; s[3].value = 'B'; s[2].dispatchEvent(new Event('change')); })()`,
    set('input.input', '1', 0),
    `(${txt('.big-say')}.includes('1,073,741,824 byte') ? '' : '1 GiB: ' + ${txt('.big-say')})`,
    `(() => { const s = document.querySelectorAll('select'); s[0].value = 'mass'; s[0].dispatchEvent(new Event('change')); s[2].value = 'kati'; s[3].value = 'g'; s[2].dispatchEvent(new Event('change')); })()`,
    `(${txt('.big-say')}.includes('604.79') ? '' : 'kati: ' + ${txt('.big-say')})`],

  'calc-time': [
    tab('Between dates'),
    set('input[type=date]', '2026-10-01', 1), set('input[type=date]', '2026-10-31', 2),
    `(() => { const t = document.querySelectorAll('.ct-kv')[0].textContent; return t.includes('Total days30') && t.includes('Working days22') ? '' : 'between: ' + t; })()`,
    `(() => { const b = document.querySelectorAll('.ct-week input'); b[0].click(); b[6].click(); b[5].click(); b[6].click(); })()`,
    `(() => { const t = document.querySelectorAll('.ct-kv')[0].textContent; return t.includes('Working days21') ? '' : 'Fri-Sat weekend: ' + t; })()`,
    `(() => { const b = document.querySelectorAll('.ct-week input'); b[5].click(); b[0].click(); })()`,
    tab('Add to a date'), set('input[type=date]', '2026-01-31', 3),
    `(() => { const i = document.querySelectorAll('.ct-nums input'); i[1].value = '1'; i[3].value = ''; i[1].dispatchEvent(new Event('input', {bubbles:true})); })()`, wait(200),
    `(${txt('.ct-kv:not([hidden])')} && document.querySelectorAll('.ct-kv')[1].textContent.includes('2026-02-28') ? '' : 'Jan 31 + 1 month: ' + document.querySelectorAll('.ct-kv')[1].textContent)`,
    tab('Time zones'),
    `(document.querySelector('.ct-zone strong').textContent === 'Kuala Lumpur' && document.querySelector('.ct-zone').textContent.includes('UTC+8') ? '' : 'home zone: ' + document.querySelector('.ct-zone').textContent)`,
    `(document.querySelectorAll('.ct-grid .ct-cell').length >= 48 ? '' : 'planner missing')`],

  'calc-silly': [set('input.input', '1', 0),
    `(document.querySelector('.cx-card[data-k=banana] strong').textContent === '5.56' ? '' : '1 m in bananas: ' + document.querySelector('.cx-card[data-k=banana] strong').textContent)`,
    `(document.querySelectorAll('.cx-notes li').length === document.querySelectorAll('.cx-card').length ? '' : 'missing footnotes')`],

  'calc-percent': [
    `(document.querySelectorAll('.big-say')[0].textContent === '15% of 80 = 12' ? '' : 'pct: ' + document.querySelectorAll('.big-say')[0].textContent)`,
    `(document.querySelectorAll('.big-say')[2].textContent.startsWith('+25%') ? '' : 'change: ' + document.querySelectorAll('.big-say')[2].textContent)`,
    `(document.querySelectorAll('.big-say')[3].textContent === 'Total RM 108.00' ? '' : 'sst 8%: ' + document.querySelectorAll('.big-say')[3].textContent)`,
    `(document.querySelectorAll('.big-say')[6].textContent === '1280 × 720' ? '' : 'ratio: ' + document.querySelectorAll('.big-say')[6].textContent)`,
    `(document.querySelectorAll('.big-say')[7].textContent.startsWith('16 : 9') ? '' : 'simplify: ' + document.querySelectorAll('.big-say')[7].textContent)`],
};
