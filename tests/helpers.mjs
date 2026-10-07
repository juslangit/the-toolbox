// Helpers for known-answer checks. Each check is a JS expression (string)
// evaluated inside the page; it returns '' when it passes, or a message.

// Sets a field and waits long enough for debounced tools to update.
export const set = (sel, v, i = 0) => `(async () => { const el = document.querySelectorAll('${sel}')[${i}]; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 250)); })()`;
export const val = (sel, i = 0) => `document.querySelectorAll('${sel}')[${i}].value`;
export const wait = ms => `new Promise(r => setTimeout(r, ${ms}))`;

// Puts a File into a file input, as if the user had picked it.
// fileExpr is a JS expression for a File, or for a Promise of a File / File[].
export function giveFile(sel, fileExpr) {
  return `(async () => { const f = await (${fileExpr}); const dt = new DataTransfer(); for (const x of [].concat(f)) dt.items.add(x); const inp = document.querySelector('${sel}'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 300)); })()`;
}

// JS expression for a test PNG File (w×h, filled with colour, with a dark square in it).
export const pngFile = (w = 64, h = 48, colour = '#e8a33d', name = 'test.png', type = 'image/png') =>
  `(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const x = c.getContext('2d'); x.fillStyle = '${colour}'; x.fillRect(0, 0, ${w}, ${h}); x.fillStyle = '#123456'; x.fillRect(${Math.floor(w / 4)}, ${Math.floor(h / 4)}, ${Math.floor(w / 2)}, ${Math.floor(h / 2)}); const b = await new Promise(r => c.toBlob(r, '${type}', 0.9)); return new File([b], '${name}', { type: '${type}' }); })()`;

// Polls until expr is truthy (or ms pass); for slow work like PDF or audio.
export const until = (expr, ms = 8000) => `(async () => { const t = Date.now(); while (Date.now() - t < ${ms}) { try { if (${expr}) return; } catch {} await new Promise(r => setTimeout(r, 100)); } })()`;
