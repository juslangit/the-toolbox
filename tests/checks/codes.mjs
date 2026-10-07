// Checks for the Codes & ciphers drawer.
import { set, val, until } from '../helpers.mjs';

const PLAIN = 'Meet me at the old harbour after the evening market closes and bring the map that your grandfather left in the wooden chest under the stairs';
const CAESAR11 = 'Xppe xp le esp zwo slcmzfc lqepc esp pgpytyr xlcvpe nwzdpd lyo mctyr esp xla esle jzfc rclyoqlespc wpqe ty esp hzzopy nspde fyopc esp deltcd';
const VIG_LEMON = 'Xiqh zp ef hup sxr ulvnchc erhrc xts rgizwar qmfxpx ozbdie oao fdwar xts zlt fvne caie rvmbqqefvrc pqtg tr fvr hsarry gtsfe yzrrc xts feeuff';
const top = `document.querySelector('.crack-row.top .crack-text').textContent`;

export default {
  morse: [
    `(${val('textarea', 1)} === '... --- ...' ? '' : 'SOS → ' + ${val('textarea', 1)})`,
    set('textarea', '.... . .-.. .-.. --- / .-- --- .-. .-.. -.. -.-.--', 1),
    `(${val('textarea', 0)} === 'HELLO WORLD!' ? '' : 'morse decode: ' + ${val('textarea', 0)})`,
    set('textarea', 'Kopi 2', 0),
    `(${val('textarea', 1)} === '-.- --- .--. .. / ..---' ? '' : 'Kopi 2 → ' + ${val('textarea', 1)})`,
    // Flash-only playback lights the lamp.
    `(() => { const s = document.querySelectorAll('.check input')[0]; s.checked = false; [...document.querySelectorAll('.btn.primary')].find(b => b.textContent === 'Play').click(); })()`,
    until(`document.querySelector('.morse-lamp.on')`, 3000),
    `(document.querySelector('.morse-lamp.on') ? '' : 'lamp never lit')`,
  ],
  nato: [
    `(${val('textarea', 1)} === 'Alfa Bravo One' ? '' : 'AB1 → ' + ${val('textarea', 1)})`,
    set('textarea', 'Hotel India / Niner Tree', 1),
    `(${val('textarea', 0)} === 'HI 93' ? '' : 'reverse: ' + ${val('textarea', 0)})`,
    set('select', 'din'), set('textarea', 'Köln', 0),
    `(${val('textarea', 1)} === 'Köln Umlaut Offenbach Leipzig Nürnberg' ? '' : 'DIN: ' + ${val('textarea', 1)})`,
  ],
  braille: [
    set('textarea', 'abc', 0),
    `(${val('textarea', 1)} === '⠁⠃⠉' ? '' : 'abc → ' + ${val('textarea', 1)})`,
    set('textarea', 'Hi 12', 0),
    `(${val('textarea', 1)} === '⠠⠓⠊ ⠼⠁⠃' ? '' : 'Hi 12 → ' + ${val('textarea', 1)})`,
    set('textarea', '⠠⠠⠝⠁⠎⠁ ⠼⠃⠚⠃⠋', 1),
    `(${val('textarea', 0)} === 'NASA 2026' ? '' : 'braille back: ' + ${val('textarea', 0)})`,
    `(document.querySelectorAll('.bcell').length === 12 && document.querySelector('.bcell span').textContent === '6' ? '' : 'cells: ' + document.querySelectorAll('.bcell').length)`,
  ],
  cipher: [
    `(${val('.output textarea')} === 'KHOOR' ? '' : 'Caesar 3 of HELLO: ' + ${val('.output textarea')})`,
    set('select', 'vigenere'), set('textarea', 'ATTACKATDAWN', 0),
    `(${val('.output textarea')} === 'LXFOPVEFRNHR' ? '' : 'Vigenère LEMON: ' + ${val('.output textarea')})`,
    set('select', 'affine'),
    `(${val('.output textarea')} === 'IZZISGIZXIOV' ? '' : 'affine 5,8: ' + ${val('.output textarea')})`,
    `document.querySelector('.tabs button[data-v=crack]').click()`,
    set('textarea', CAESAR11, 2), 'new Promise(r => setTimeout(r, 400))',
    `(${top} === ${JSON.stringify(PLAIN)} && document.querySelector('.crack-row.top').textContent.includes('shift 11') ? '' : 'caesar crack: ' + ${top}.slice(0, 50))`,
    set('textarea', VIG_LEMON, 2), 'new Promise(r => setTimeout(r, 400))',
    `(${top} === ${JSON.stringify(PLAIN)} && document.querySelector('.crack-row.top').textContent.includes('LEMON') ? '' : 'vigenère crack: ' + ${top}.slice(0, 50))`,
  ],
  barcode: [
    until(`document.querySelectorAll('.output input')[0].value`, 8000),
    `(${val('.output input')} === '4006381333931' ? '' : 'EAN-13 check digit: ' + ${val('.output input')})`,
    `(() => { const c = document.querySelector('canvas.barcode-canvas'); if (c.width < 100) return 'canvas width ' + c.width; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 60) dark++; return dark > 500 ? '' : 'barcode blank'; })()`,
    set('input.input', '4006381333932', 0), 'new Promise(r => setTimeout(r, 300))',
    `(document.querySelector('.note.error')?.textContent.includes('should be 1') ? '' : 'bad check digit not caught')`,
    set('select', 'datamatrix'), set('input.input', 'Selamat datang 👋', 0),
    until(`document.querySelectorAll('.output input')[0].value === 'Selamat datang 👋'`, 3000),
    `(${val('.output input')} === 'Selamat datang 👋' && !document.querySelector('canvas.barcode-canvas').classList.contains('dim') ? '' : 'datamatrix failed')`,
  ],
};
