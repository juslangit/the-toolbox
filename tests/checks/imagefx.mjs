// Checks for the image-effects half of the Images drawer (js/tools/imagefx.js).
import { set, wait, giveFile, pngFile, until } from '../helpers.mjs';

// Pixel [r,g,b,a] at (x,y) of the n-th canvas matching sel.
const px = (sel, x, y, n = 0) => `[...document.querySelectorAll('${sel}')[${n}].getContext('2d').getImageData(${x}, ${y}, 1, 1).data]`;
const stageCanvas = '.fx-stage canvas';

// A picture made of three vertical bands: red | green | blue.
const bands = (w = 300, hh = 100) => `(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${hh}; const x = c.getContext('2d'); ['#ff0000', '#00ff00', '#0000ff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * ${w} / 3, 0, ${w} / 3, ${hh}); }); const b = await new Promise(r => c.toBlob(r, 'image/png')); return new File([b], 'bands.png', { type: 'image/png' }); })()`;
// A flat grey picture.
const grey = (w = 64, hh = 48) => `(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${hh}; const x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, ${w}, ${hh}); const b = await new Promise(r => c.toBlob(r, 'image/png')); return new File([b], 'grey.png', { type: 'image/png' }); })()`;
// Runs a workflow step from this drawer straight from the module.
const step = (id, file, opts) => `(async () => { const m = await import('/js/tools/imagefx.js'); const s = m.default.flatMap(t => t.steps || []).find(s => s.id === '${id}'); return s.run([await (${file})], { ...Object.fromEntries(s.options.map(o => [o.key, o.value])), ...${JSON.stringify(opts || {})} }, { progress() {} }); })()`;
const sizeOf = files => `(async () => { const f = (await ${files})[0]; const b = await createImageBitmap(f); return [f.name, f.type, b.width, b.height]; })()`;

export default {
  'img-matte': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('${stageCanvas}')`),
    `(() => { const c = document.querySelector('${stageCanvas}'); return c.width === 73 && c.height === 73 ? '' : 'matte with 6% padding: ' + c.width + '×' + c.height; })()`,
    set('input[type=range]', '0'), wait(150),
    `(() => { const c = document.querySelector('${stageCanvas}'); const a = ${px(stageCanvas, 1, 1)}, b = ${px(stageCanvas, 32, 32)};
      return c.width === 64 && c.height === 64 && a.join() === '255,255,255,255' && b.slice(0, 3).join() === '18,52,86' ? '' : 'square matte: ' + c.width + '×' + c.height + ' ' + a + ' / ' + b; })()`,
    set('select', '16:9', 0), wait(150),
    `(() => { const c = document.querySelector('${stageCanvas}'); return c.width === 85 && c.height === 48 ? '' : '16:9 matte: ' + c.width + '×' + c.height; })()`,
    set('select', 'none', 1), wait(150),
    `(${px(stageCanvas, 1, 1)}[3] === 0 ? '' : 'transparent matte is not see-through')`,
    `(async () => { const [n, t, w, hh] = await ${sizeOf(step('img-matte', pngFile(64, 48, '#e8a33d', 'p.jpg', 'image/jpeg'), { ratio: '4:5', padding: 0 }))}; return n === 'p-matte.jpg' && t === 'image/jpeg' && w === 64 && hh === 80 ? '' : 'img-matte step: ' + [n, t, w, hh]; })()`,
  ],
  'img-carousel': [
    giveFile('input[type=file]', bands()), until(`document.querySelectorAll('.fx-slide canvas').length === 3`),
    `(() => { const cs = document.querySelectorAll('.fx-slide canvas'); if (cs.length !== 3 || cs[0].width !== 1080 || cs[0].height !== 1080) return 'slides: ' + cs.length + ' ' + cs[0]?.width + '×' + cs[0]?.height;
      const mid = i => [...cs[i].getContext('2d').getImageData(540, 540, 1, 1).data].slice(0, 3).join();
      return mid(0) === '255,0,0' && mid(1) === '0,255,0' && mid(2) === '0,0,255' ? '' : 'slide colours ' + [mid(0), mid(1), mid(2)].join(' | '); })()`,
    set('select', '4:5', 0), wait(200),
    `(() => { const cs = document.querySelectorAll('.fx-slide canvas'); return cs[0].width === 1080 && cs[0].height === 1350 ? '' : '4:5 slide ' + cs[0].width + '×' + cs[0].height; })()`,
    set('input[type=range]', '5', 0), wait(200),
    `(document.querySelectorAll('.fx-slide canvas').length === 5 && document.querySelector('.fx-strip + .field-hint').textContent.includes('5 slides') ? '' : 'five slides: ' + document.querySelectorAll('.fx-slide canvas').length)`,
  ],
  'img-watermark': [
    giveFile('input[type=file]', pngFile(200, 100, '#ffffff')), until(`document.querySelector('${stageCanvas}')`),
    set('input.input', 'MARK', 0), set('input[type=color]', '#000000'), set('select', 'tl', 1),
    set('input[type=range]', '100', 1),
    `(() => { const box = document.querySelectorAll('input[type=checkbox]')[0]; box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); })()`, wait(200),
    `(() => { const x = document.querySelector('${stageCanvas}').getContext('2d'); const dark = (x0, y0, w, hh) => { const d = x.getImageData(x0, y0, w, hh).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 80) n++; return n; };
      const tl = dark(0, 0, 100, 25), br = dark(150, 80, 50, 20); return tl > 30 && br === 0 ? '' : 'watermark dark pixels top-left ' + tl + ', bottom-right ' + br; })()`,
    giveFile('input[type=file]', `Promise.all([${pngFile(80, 60, '#ffffff', 'a.png')}, ${pngFile(80, 60, '#ffffff', 'b.png')}])`), wait(300),
    `(document.querySelector('.btn.primary').textContent.includes('all 2') && document.querySelectorAll('.chips .chip').length === 2 ? '' : 'batch of two: ' + document.querySelector('.btn.primary').textContent)`,
    `(async () => { const f = (await ${step('img-watermark', pngFile(120, 80, '#ffffff', 'w.png'), { text: 'XX', position: 'c', opacity: 1, colour: '#000000', size: 50 })})[0];
      const b = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = 120; c.height = 80; const x = c.getContext('2d'); x.drawImage(b, 0, 0);
      const d = x.getImageData(0, 0, 120, 10).data; let edge = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 80) edge++;
      return f.name === 'w-watermarked.png' && edge === 0 ? '' : 'img-watermark step: ' + f.name + ' edge dark ' + edge; })()`,
  ],
  'img-deskew': [
    `(async () => { const { squareToQuad, quadSize, quadOk } = await import('/js/lib/fx-warp.js');
      const m = squareToQuad([[0, 0], [100, 0], [80, 100], [20, 100]]); const r = v => v.map(n => Math.round(n * 1000) / 1000).join();
      const a = r(m(1, 1)), b = r(m(0, 1)), c = r(m(0.5, 0)), s = quadSize([[0, 0], [100, 0], [80, 100], [20, 100]]).join();
      const bad = quadOk([[0, 0], [100, 100], [100, 0], [0, 100]]);
      return a === '80,100' && b === '20,100' && c === '50,0' && s === '100,102' && !bad ? '' : 'homography: ' + [a, b, c, s, bad].join(' | '); })()`,
    giveFile('input[type=file]', pngFile(200, 100)), until(`document.querySelector('.fx-flat canvas')`),
    `(document.querySelector('.fx-flat').nextElementSibling.textContent === 'Full size: 160 × 80 px' ? '' : 'default corners: ' + document.querySelector('.fx-flat').nextElementSibling.textContent)`,
    `[...document.querySelectorAll('.btn')].find(b => b.textContent === 'Whole picture').click()`, wait(250),
    `(() => { const c = document.querySelector('.fx-flat canvas'); const a = ${px('.fx-flat canvas', 2, 2)}, m = ${px('.fx-flat canvas', 100, 50)};
      return c.width === 200 && c.height === 100 && a.slice(0, 3).join() === '232,163,61' && m.slice(0, 3).join() === '18,52,86' ? '' : 'flat copy: ' + c.width + '×' + c.height + ' ' + a + ' / ' + m; })()`,
    // Drag the top-left handle a quarter of the way in, like a finger would.
    `(async () => { const hd = document.querySelector('.fx-handle'); const r = hd.getBoundingClientRect(); const w = document.querySelector('.fx-deskew').getBoundingClientRect();
      const o = { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      hd.dispatchEvent(new PointerEvent('pointerdown', o));
      hd.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: o.clientX + w.width / 4, clientY: o.clientY + w.height / 4 }));
      hd.dispatchEvent(new PointerEvent('pointerup', o)); await new Promise(r => setTimeout(r, 250));
      const pts = document.querySelector('.fx-quad polygon').getAttribute('points').split(' ')[0].split(',').map(Math.round).join();
      const corner = ${px('.fx-flat canvas', 2, 2)};
      // The new top-left corner sits on the dark square's corner, so the result now starts dark.
      return pts === '50,25' && hd.style.left === '25%' && corner[0] < 60 ? '' : 'after drag: corner ' + pts + ' handle ' + hd.style.left + ' pixel ' + corner; })()`,
  ],
  'img-mask': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('${stageCanvas}')`),
    `(() => { const c = document.querySelector('${stageCanvas}'); const corner = ${px(stageCanvas, 1, 1)}, mid = ${px(stageCanvas, 24, 24)};
      return c.width === 48 && c.height === 48 && corner[3] === 0 && mid.join() === '18,52,86,255' ? '' : 'circle mask: ' + c.width + ' ' + corner + ' / ' + mid; })()`,
    `document.querySelectorAll('.tabs button')[4].click()`, wait(200),
    `(() => { const top = ${px(stageCanvas, 24, 6)}, side = ${px(stageCanvas, 3, 40)}; return top[3] > 200 && side[3] === 0 ? '' : 'star mask: tip ' + top + ' side ' + side; })()`,
  ],
  'img-trace': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.fx-stage img')`, 10000),
    `(async () => { const svg = await (await fetch(document.querySelector('.fx-stage img').src)).text();
      const fills = [...svg.matchAll(/fill="rgb\\((\\d+),(\\d+),(\\d+)\\)"/g)].map(m => m.slice(1).map(Number));
      const near = (t) => fills.some(f => f.every((v, i) => Math.abs(v - t[i]) < 24));
      return svg.includes('viewBox="0 0 64 48"') && near([18, 52, 86]) && near([232, 163, 61]) ? '' : 'trace: ' + svg.slice(0, 160) + ' fills ' + JSON.stringify(fills.slice(0, 4)); })()`,
    `(/\\d+ shapes · .* · traced in/.test(document.querySelector('.fx-stage').closest('.card').querySelector('.field-hint').textContent) ? '' : 'trace info missing')`,
  ],
  'img-grain': [
    giveFile('input[type=file]', grey()), until(`document.querySelector('${stageCanvas}')`), wait(150),
    `(() => { const d = document.querySelector('${stageCanvas}').getContext('2d').getImageData(0, 0, 64, 48).data; let same = true, s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) same = false; s += d[i]; s2 += d[i] * d[i]; n++; }
      const sd = Math.sqrt(s2 / n - (s / n) ** 2); return same && sd > 4 && Math.abs(s / n - 128) < 4 ? '' : 'mono grain: grey ' + same + ' sd ' + sd.toFixed(1) + ' mean ' + (s / n).toFixed(1); })()`,
    `(() => { const box = document.querySelector('input[type=checkbox]'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); })()`, wait(200),
    `(() => { const d = document.querySelector('${stageCanvas}').getContext('2d').getImageData(0, 0, 64, 48).data; let diff = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1]) diff++; return diff > 500 ? '' : 'colour noise is not coloured: ' + diff; })()`,
    set('input[type=range]', '0', 0), wait(200),
    `(() => { const d = document.querySelector('${stageCanvas}').getContext('2d').getImageData(0, 0, 64, 48).data; return d.every((v, i) => i % 4 === 3 ? v === 255 : v === 128) ? '' : 'amount 0 changed the picture'; })()`,
  ],
  'img-bg-remove': [
    // The model is ~88 MB, so the committed check only asks — it never downloads.
    until(`document.querySelector('.heavy-ask')`, 3000),
    `(document.querySelector('.heavy-ask .btn.primary')?.textContent.includes('88 MB') ? '' : 'no download prompt')`,
    `(async () => { try { await ${step('img-bg-remove', pngFile(32, 32))}; return 'step ran without the model'; } catch (e) { return e.message.includes('Open the Background remover tool once') ? '' : 'step error: ' + e.message; } })()`,
    // Colour fill works on any cut-out: feed it a fake one through the composer path is UI-only, so just check the controls exist.
    `(document.querySelectorAll('.tabs button').length === 2 && document.querySelector('input[type=color]') ? '' : 'fill controls missing')`,
  ],
};
