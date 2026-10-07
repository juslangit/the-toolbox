// Checks for the Images drawer (core half): js/tools/images.js
import { set, val, wait, giveFile, pngFile, until } from '../helpers.mjs';

// A JPEG with camera details and a GPS position (Kuala Lumpur) written into it.
const exifJpeg = `(async () => {
  const m = await import('/js/lib/img-meta.js');
  const c = document.createElement('canvas'); c.width = 40; c.height = 30;
  const x = c.getContext('2d'); x.fillStyle = '#336699'; x.fillRect(0, 0, 40, 30);
  const b = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
  const out = m.insertExif(b, m.buildExif({ Make: 'TestCam', Model: 'TestCam X1', Software: 'Toolbox test', DateTimeOriginal: '2026:10:07 09:30:00', GPSLatitude: 3.139, GPSLongitude: 101.6869 }));
  return new File([out], 'gps.jpg', { type: 'image/jpeg' });
})()`;

// 100×80, see-through, with a 30×20 red block at (10, 15).
const clearPng = `(async () => {
  const c = document.createElement('canvas'); c.width = 100; c.height = 80;
  const x = c.getContext('2d'); x.fillStyle = '#d02020'; x.fillRect(10, 15, 30, 20);
  return new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'logo.png', { type: 'image/png' });
})()`;

// Colour of pixel (x, y) of an image URL or File, as 'r,g,b,a'.
const pixelOf = (srcExpr, x, y) => `(async () => {
  const s = await (${srcExpr});
  const img = new Image(); img.src = typeof s === 'string' ? s : URL.createObjectURL(s); await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return [...g.getImageData(${x}, ${y}, 1, 1).data].join(',');
})()`;
const listFiles = `document.querySelector('.img-files').files`;
const bytes = f => `new Uint8Array(await ${f}.arrayBuffer())`;

export default {
  'img-atlas': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.img-dims')`),
    `(() => { const d = document.querySelector('.img-dims').textContent, r = document.querySelector('.img-ratio').textContent, sw = document.querySelector('.img-swatch')?.dataset.hex, a = document.querySelector('.img-alpha').textContent;
      return d === '64 × 48 px' && r === '4:3' && sw === '#e8a33d' && a === 'No' ? '' : 'atlas facts: ' + [d, r, sw, a].join(' / '); })()`,
    `(document.querySelector('.img-swatch small').textContent === '75%' ? '' : 'main colour share: ' + document.querySelector('.img-swatch small').textContent)`,
    giveFile('input[type=file]', exifJpeg), until(`document.querySelector('.img-lat')`),
    `(() => { const lat = document.querySelector('.img-lat').textContent, lon = document.querySelector('.img-lon').textContent, cam = document.querySelector('.img-camera').textContent;
      return lat === '3.139000' && lon === '101.686900' && cam.includes('TestCam X1') && cam.includes('2026-10-07 09:30:00') ? '' : 'atlas exif: ' + [lat, lon, cam].join(' / '); })()`,
    `(document.querySelector('a[href*="openstreetmap.org/?mlat=3.139000&mlon=101.686900"]') ? '' : 'no map link')`,
  ],
  'img-compress': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.img-verdict').textContent`),
    `(document.querySelector('.img-verdict').closest('.card').dataset.type === 'image/png' ? '' : 'default type for PNG: ' + document.querySelector('.img-verdict').closest('.card').dataset.type)`,
    // Palette PNG keeps the two exact colours.
    `(async () => { const p = await ${pixelOf(`document.querySelector('.img-compare-after img').src`, 32, 24)}; const q = await ${pixelOf(`document.querySelector('.img-compare-after img').src`, 1, 1)}; return p === '18,52,86,255' && q === '232,163,61,255' ? '' : 'palette png colours: ' + p + ' ' + q; })()`,
    set('select', 'image/jpeg', 0), wait(400),
    `(document.querySelector('.img-verdict').closest('.card').dataset.type === 'image/jpeg' && document.querySelector('.img-verdict').textContent.includes('→') ? '' : 'jpeg compress: ' + document.querySelector('.img-verdict').textContent)`,
  ],
  'img-convert': [
    set('select', 'image/jpeg', 0),
    giveFile('input[type=file]', `Promise.all([${pngFile(64, 48, '#e8a33d', 'a.png')}, ${pngFile(64, 48, '#e8a33d', 'b.png')}])`),
    until(`${listFiles}?.length === 2`),
    `(async () => { const f = ${listFiles}; const b = ${bytes(`f[0]`)}; return f[0].name === 'a.jpg' && f[1].name === 'b.jpg' && b[0] === 0xff && b[1] === 0xd8 ? '' : 'convert jpeg: ' + f.map(x => x.name); })()`,
    set('select', 'image/x-icon', 0), until(`${listFiles}?.[0]?.name === 'a.ico'`),
    `(async () => { const b = ${bytes(`${listFiles}[0]`)}; return b[2] === 1 && b[4] === 3 && b[6] === 16 && b[22] === 32 && b[38] === 48 ? '' : 'ico header: ' + [...b.slice(0, 8)]; })()`,
    set('select', 'image/gif', 0), until(`${listFiles}?.[0]?.name === 'a.gif'`),
    `(async () => { const p = await ${pixelOf(`${listFiles}[0]`, 32, 24)}, q = await ${pixelOf(`${listFiles}[0]`, 0, 0)}; return p === '18,52,86,255' && q === '232,163,61,255' ? '' : 'gif pixels: ' + p + ' ' + q; })()`,
    set('select', 'image/bmp', 0), until(`${listFiles}?.[0]?.name === 'a.bmp'`),
    `(async () => { const p = await ${pixelOf(`${listFiles}[0]`, 32, 24)}; return p === '18,52,86,255' ? '' : 'bmp pixel: ' + p; })()`,
    set('select', 'image/icns', 0), until(`${listFiles}?.[0]?.name === 'a.icns'`),
    `(async () => { const b = ${bytes(`${listFiles}[0]`)}; const v = new DataView(b.buffer); return String.fromCharCode(...b.slice(0, 4)) === 'icns' && v.getUint32(4) === b.length ? '' : 'icns header'; })()`,
    // Workflow step with a format this browser may not write falls back with a working file.
    `(async () => { const { hub } = await import('/js/hub.js'); const s = hub.tools.flatMap(t => t.steps || []).find(s => s.id === 'img-convert'); const out = await s.run([await ${pngFile(64, 48)}], { format: 'image/webp', quality: 0.8 }); return out[0].name === 'test.webp' && out[0].type === 'image/webp' ? '' : 'convert step: ' + out[0].name; })()`,
  ],
  'img-resize': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`${listFiles}?.length === 1`),
    `(document.querySelector('.img-file').dataset.w === '64' ? '' : 'never-upscale: ' + document.querySelector('.img-file').dataset.w)`,
    set('input.input', '32', 0), wait(700),
    `(() => { const r = document.querySelector('.img-file').dataset; return r.w === '32' && r.h === '24' ? '' : 'resize to 32: ' + r.w + '×' + r.h; })()`,
    `document.querySelectorAll('.tabs button')[2].click()`, set('input.input', '25', 3), wait(700),
    `(() => { const r = document.querySelector('.img-file').dataset; return r.w === '16' && r.h === '12' ? '' : 'resize 25%: ' + r.w + '×' + r.h; })()`,
    `(async () => { const { hub } = await import('/js/hub.js'); const s = hub.tools.flatMap(t => t.steps || []).find(s => s.id === 'img-resize'); const out = await s.run([await ${pngFile(200, 100)}], { max: 50 }); const img = new Image(); img.src = URL.createObjectURL(out[0]); await img.decode(); return img.naturalWidth === 50 && img.naturalHeight === 25 ? '' : 'resize step: ' + img.naturalWidth; })()`,
  ],
  'img-social': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.img-crop-canvas').width === 1080`),
    `(() => { const c = document.querySelector('.img-crop-canvas'), g = c.getContext('2d'); const mid = [...g.getImageData(540, 540, 1, 1).data].join(','), corner = [...g.getImageData(5, 5, 1, 1).data].join(','); return c.height === 1080 && mid === '18,52,86,255' && corner === '232,163,61,255' ? '' : 'square crop: ' + c.height + ' ' + mid + ' ' + corner; })()`,
    `document.querySelector('.chip[data-id="x-header"]').click()`,
    `(() => { const c = document.querySelector('.img-crop-canvas'); return c.width === 1500 && c.height === 500 ? '' : 'x header size ' + c.width + 'x' + c.height; })()`,
  ],
  'img-strip': [
    giveFile('input[type=file]', exifJpeg), until(`document.querySelector('.img-gps')`),
    `(document.querySelector('.img-gps').textContent.includes('3.13900, 101.68690') ? '' : 'strip gps shown: ' + document.querySelector('.img-gps').textContent)`,
    `[...document.querySelectorAll('.btn.primary')].find(b => b.textContent.startsWith('Remove metadata')).click()`, until(`${listFiles}?.length === 1`),
    `(async () => { const m = await import('/js/lib/img-meta.js'); const f = ${listFiles}[0]; const i = m.inspect(${bytes('f')}); const note = document.querySelector('.img-file-note').textContent;
      return !i.gps && !i.tags.Make && f.name === 'gps.jpg' && note.includes('nothing left') ? '' : 'strip result: ' + JSON.stringify(i.tags) + ' ' + note; })()`,
    // Rotation survives stripping.
    `(async () => { const m = await import('/js/lib/img-meta.js'); const c = document.createElement('canvas'); c.width = 8; c.height = 4; const b = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg'))).arrayBuffer());
      const j = m.insertExif(b, m.buildExif({ Make: 'X', Orientation: 6, GPSLatitude: 1, GPSLongitude: 1 })); const s = m.inspect(m.strip(j)); return s.tags.Orientation === 6 && !s.tags.Make && !s.gps ? '' : 'orientation kept: ' + JSON.stringify(s.tags); })()`,
  ],
  'img-favicon': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.img-fav[data-name="apple-touch-icon.png"] img')?.complete && document.querySelector('.img-fav[data-name="apple-touch-icon.png"] img').naturalWidth`),
    `(() => { const out = document.querySelector('.img-fav-grid').closest('.stack'); const a = document.querySelector('.img-fav[data-name="apple-touch-icon.png"] img').naturalWidth, big = document.querySelector('.img-fav[data-name="android-chrome-512x512.png"] img').naturalWidth;
      return out.dataset.count === '7' && a === 180 && big === 512 ? '' : 'favicon files: ' + out.dataset.count + ' ' + a + ' ' + big; })()`,
    `(${val('.output textarea', 0)}.includes('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">') && JSON.parse(${val('.output textarea', 1)}).icons.length === 2 ? '' : 'favicon html/manifest')`,
    // The workflow "Favicon pack from a logo" (trim → favicons) end to end.
    `(async () => { const { runWorkflow, PRESETS } = await import('/js/workflows.js'); const out = await runWorkflow(PRESETS.find(p => p.id === 'favicon-pack'), [await ${clearPng}]);
      const ico = out.find(f => f.name === 'favicon.ico'); const b = ${bytes('ico')}; return out.length === 7 && b[4] === 3 ? '' : 'favicon-pack workflow: ' + out.map(f => f.name); })()`,
  ],
  'img-trim': [
    giveFile('input[type=file]', clearPng), until(`document.querySelector('.img-trim-say').dataset.w`),
    `(() => { const d = document.querySelector('.img-trim-say').dataset; return d.w === '30' && d.h === '20' ? '' : 'trim alpha: ' + d.w + '×' + d.h; })()`,
    giveFile('input[type=file]', pngFile(64, 48)), until(`document.querySelector('.img-trim-say').dataset.w === '32'`),
    `(() => { const d = document.querySelector('.img-trim-say').dataset; return d.w === '32' && d.h === '24' ? '' : 'trim colour: ' + d.w + '×' + d.h; })()`,
  ],
  'img-split': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`${listFiles}?.length === 3`),
    set('input.input', '2', 0), until(`${listFiles}?.length === 6`),
    `(() => { const r = [...document.querySelectorAll('.img-file')].map(e => e.dataset.w + 'x' + e.dataset.h).join(' '); return r === '21x24 22x24 21x24 21x24 22x24 21x24' && ${listFiles}[0].name === 'test_r1_c1.png' ? '' : 'tiles: ' + r; })()`,
  ],
  'img-stitch': [
    giveFile('input[type=file]', `Promise.all([${pngFile(64, 48)}, ${pngFile(32, 24, '#ffffff', 'small.png')}])`), until(`document.querySelector('.img-stitch-say').dataset.w`),
    `(() => { const d = document.querySelector('.img-stitch-say').dataset; return d.w === '64' && d.h === '24' ? '' : 'stitch same height: ' + d.w + '×' + d.h; })()`,
    set('input.input', '10', 1), wait(400),
    `(() => { const d = document.querySelector('.img-stitch-say').dataset; return d.w === '74' && d.h === '24' ? '' : 'stitch with gap: ' + d.w + '×' + d.h; })()`,
    `document.querySelectorAll('.tabs button')[1].click()`,
    `(() => { const d = document.querySelector('.img-stitch-say').dataset; return d.w === '32' && d.h === '58' ? '' : 'stitch stacked: ' + d.w + '×' + d.h; })()`,
  ],
  'svg-optimise': [
    set('textarea', '<?xml version="1.0"?>\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><metadata>junk</metadata><g><rect x="0.000001" y="0" width="10.000000" height="10" fill="#ff0000"/></g></svg>', 0),
    until(`${val('.output textarea')}.length`),
    `(() => { const o = ${val('.output textarea')}; return o.startsWith('<svg') && !o.includes('<!--') && !o.includes('metadata') && !o.includes('0.000001') && o.includes('red') && document.querySelector('.img-verdict').textContent.includes('smaller') ? '' : 'svgo: ' + o; })()`,
  ],
  'img-base64': [
    giveFile('input[type=file]', pngFile(64, 48)), until(`${val('.output textarea', 0)}.length`),
    `(${val('.output textarea', 0)}.startsWith('data:image/png;base64,iVBORw0KGgo') && ${val('.output textarea', 2)}.includes('width="64" height="48"') ? '' : 'b64: ' + ${val('.output textarea', 0)}.slice(0, 40))`,
    `document.querySelectorAll('.tabs button')[1].click()`,
    set('textarea', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 4), until(`document.querySelector('.img-b64-dec').textContent`),
    `(document.querySelector('.img-b64-dec').textContent.startsWith('PNG · 1 × 1 px') ? '' : 'b64 decode: ' + document.querySelector('.img-b64-dec').textContent)`,
  ],
  'img-paste': [
    `(async () => { const f = await ${pngFile(64, 48)}; const dt = new DataTransfer(); dt.items.add(f); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`,
    until(`document.querySelector('.img-paste-say').dataset.w`),
    `(() => { const d = document.querySelector('.img-paste-say').dataset; return d.w === '64' && d.h === '48' && location.hash === '#/tool/img-paste' ? '' : 'paste: ' + d.w; })()`,
  ],
};
