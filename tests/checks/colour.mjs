// Known-answer checks for the Colour drawer.
import { set, val, wait, giveFile, pngFile, until } from '../helpers.mjs';

const hexes = sel => `[...document.querySelectorAll('${sel}')].map(e => e.dataset.hex)`;
const pointer = (type, fx, fy) => `(() => { const c = document.querySelector('.cz-pick-canvas'); const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('${type}', { bubbles: true, pointerType: 'mouse', clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy} })); })()`;

export default {
  'colour-atlas': [
    set('.cz-field input.mono', 'rgb(232 163 61)'),
    `(${val('.output input', 0)} === '#e8a33d' && ${val('.output input', 5)} === 'oklch(76.5% 0.14 72.9)' && ${val('.output input', 7)} === 'lab(72.6% 19.9 60.8)' ? '' : 'atlas formats: ' + ${val('.output input', 0)} + ' ' + ${val('.output input', 5)})`,
    `(${val('.output input', 10)}.startsWith('goldenrod') ? '' : 'nearest name: ' + ${val('.output input', 10)})`,
    set('.cz-field input.mono', '#777777'),
    `(document.querySelector('.cz-ctile').textContent.includes('4.48:1') ? '' : 'contrast on white: ' + document.querySelector('.cz-ctile').textContent)`,
    set('.cz-field input.mono', 'teal'),
    `(${val('.output input', 10)} === 'teal' && document.querySelector('.cz-hero-name').textContent === 'teal' ? '' : 'exact name')`,
  ],
  'colour-contrast': [
    set('.cz-field input.mono', '#777777', 0), set('.cz-field input.mono', '#ffffff', 1),
    `(document.querySelector('.cz-ratio strong').textContent === '4.48:1' && document.querySelector('.cz-wcag').textContent.includes('✗ 4.5') ? '' : '#777 on white: ' + document.querySelector('.cz-ratio strong').textContent)`,
    `(async () => { const M = await import('/js/lib/colour-maths.js'); const hs = ${hexes('.cz-sugg .cz-sw')}; if (hs.length < 2) return 'no suggestions'; const r = M.contrast(M.parse(hs[0]), M.parse('#ffffff')); return r >= 4.5 && r < 4.7 ? '' : 'suggested text ' + hs[0] + ' ratio ' + r; })()`,
    set('.cz-field input.mono', '#000000', 0),
    `(document.querySelector('.cz-ratio strong').textContent === '21.00:1' && Math.round(parseFloat(document.querySelector('.cz-lc').textContent)) === 106 ? '' : 'black on white: ' + document.querySelector('.cz-ratio strong').textContent + ' Lc ' + document.querySelector('.cz-lc').textContent)`,
    `document.querySelector('.cz-pair > .btn').click()`,
    `(${val('.cz-field input.mono', 0)} === '#ffffff' && Math.round(parseFloat(document.querySelector('.cz-lc').textContent)) === -108 ? '' : 'swap: ' + ${val('.cz-field input.mono', 0)})`,
  ],
  'colour-harmony': [
    set('select', 'hsl', 0), set('.cz-field input.mono', '#ff0000'),
    `(JSON.stringify(${hexes('.cz-row .cz-sw')}) === '["#ff0000","#00ffff"]' ? '' : 'hsl complement: ' + JSON.stringify(${hexes('.cz-row .cz-sw')}))`,
    `[...document.querySelectorAll('.tabs button')].find(b => b.dataset.v === 'triadic').click()`,
    `(JSON.stringify(${hexes('.cz-row .cz-sw')}) === '["#ff0000","#00ff00","#0000ff"]' ? '' : 'hsl triad: ' + JSON.stringify(${hexes('.cz-row .cz-sw')}))`,
    `(document.querySelector('canvas.cz-wheel').getContext('2d').getImageData(320, 4, 1, 1).data[0] > 200 ? '' : 'wheel not drawn red at the top')`,
  ],
  'colour-palette': [
    `(document.querySelectorAll('.cz-gen-col').length === 5 ? '' : 'palette size ' + document.querySelectorAll('.cz-gen-col').length)`,
    `(() => { const p = document.querySelector('.cz-gen-pick'); p.value = '#e8a33d'; p.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    `document.querySelector('.btn.primary').click()`,
    `(() => { const t = document.querySelector('.cz-gen-hex').textContent; const e = ${val('.output textarea')}; return t === '#E8A33D' && e.includes('--palette-1: #e8a33d;') && document.querySelector('.cz-gen-col').classList.contains('locked') ? '' : 'lock kept? ' + t; })()`,
    `(() => { const before = document.querySelectorAll('.cz-gen-hex')[2].textContent; document.activeElement?.blur(); dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); const after = document.querySelectorAll('.cz-gen-hex')[2].textContent; return before !== after && document.querySelector('.cz-gen-hex').textContent === '#E8A33D' ? '' : 'space bar did not roll'; })()`,
  ],
  'colour-collection': [
    until(`document.querySelectorAll('.cz-coll-item').length`),
    `(document.querySelectorAll('.cz-coll-item').length === 40 ? '' : 'palettes ' + document.querySelectorAll('.cz-coll-item').length)`,
    set('input.input', 'teh'),
    `(document.querySelectorAll('.cz-coll-item').length === 1 && document.querySelector('.cz-coll-item strong').textContent === 'Teh Tarik' ? '' : 'search teh')`,
  ],
  'colour-extract': [
    giveFile('input[type=file]', pngFile(64, 48, '#e8a33d')),
    until(`document.querySelectorAll('.cz-extract .cz-sw').length`),
    `(() => { const hs = ${hexes('.cz-extract .cz-sw')}; const ls = [...document.querySelectorAll('.cz-extract .cz-sw-label')].map(e => e.textContent); return JSON.stringify(hs) === '["#e8a33d","#123456"]' && ls[0] === '75.0%' && ls[1] === '25.0%' ? '' : 'extract: ' + hs + ' ' + ls; })()`,
  ],
  'colour-picker': [
    giveFile('input[type=file]', pngFile(64, 48, '#e8a33d')), wait(200),
    pointer('pointermove', 0.5, 0.5), pointer('pointerup', 0.5, 0.5),
    pointer('pointerup', 0.05, 0.05),
    `(JSON.stringify(${hexes('.cz-picked .cz-sw')}) === '["#e8a33d","#123456"]' ? '' : 'picked: ' + JSON.stringify(${hexes('.cz-picked .cz-sw')}))`,
    `(document.querySelector('.cz-now code')?.textContent === '#123456' ? '' : 'loupe readout')`,
  ],
  'colour-tailwind': [
    set('.cz-field input.mono', '#3b82f6'),
    `(document.querySelector('.cz-scale-row.base .cz-sw').dataset.hex === '#3b82f6' && ${val('.output textarea', 0)}.includes('--color-brand-500: oklch(62.3% 0.188 259.8);') ? '' : 'tw base: ' + ${val('.output textarea', 0)}.slice(0, 120))`,
    `(() => { const j = JSON.parse(${val('.output textarea', 1)}).brand; return Object.keys(j).length === 11 && j['500'] === '#3b82f6' && j['50'] > '#e' ? '' : 'tw v3 json'; })()`,
  ],
  'colour-blind': [
    set('textarea.input', '#ff0000 #e8a33d'),
    `(() => { const hs = ${hexes('.cz-cvd-row[data-kind=deuteranopia] button')}; return JSON.stringify(hs) === '["#a39000","#ccb740"]' ? '' : 'deuteranopia palette: ' + hs; })()`,
    `(${hexes('.cz-cvd-row[data-kind=achromatopsia] button')}.every(x => x.slice(1, 3) === x.slice(3, 5) && x.slice(3, 5) === x.slice(5, 7)) ? '' : 'achromatopsia not grey')`,
    giveFile('input[type=file]', pngFile(64, 48, '#e8a33d')), wait(200),
    `(() => { const d = document.querySelector('canvas[data-sim]').getContext('2d').getImageData(1, 1, 1, 1).data; return Math.abs(d[0] - 0xcc) <= 1 && Math.abs(d[1] - 0xb7) <= 1 && Math.abs(d[2] - 0x40) <= 1 ? '' : 'simulated pixel ' + [...d]; })()`,
  ],
  'colour-gradient': [
    `(${val('.output textarea')}.includes('linear-gradient(in oklch 90deg, #e8a33d 0%, #5b2a86 100%)') ? '' : 'gradient css: ' + ${val('.output textarea')})`,
    set('.cz-stop input.mono', '#000000', 0), set('.cz-stop input.mono', '#ffffff', 1),
    `(${val('.output textarea')}.includes('#636363 50%') ? '' : 'oklch midpoint: ' + ${val('.output textarea')})`,
    set('select', 'srgb', 0),
    `(${val('.output textarea')} === 'background: linear-gradient(90deg, #000000 0%, #ffffff 100%);' ? '' : 'srgb css: ' + ${val('.output textarea')})`,
  ],
};
