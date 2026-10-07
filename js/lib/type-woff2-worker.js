// Classic worker that turns WOFF2 into plain TrueType/OpenType bytes with
// wawoff2 (Google's woff2 decoder compiled to wasm, MIT). It runs in a worker so
// its global `Module` never clashes with anything on the page.
let ready;
const up = new Promise(r => { ready = r; });
self.Module = { onRuntimeInitialized: () => ready() };
importScripts('../../vendor/wawoff2-decompress.js');
self.onmessage = async e => {
  try {
    await up;
    const out = self.Module.decompress(new Uint8Array(e.data));
    if (out === false) throw new Error('This WOFF2 file could not be decoded');
    const buf = out.slice().buffer;
    self.postMessage({ ok: true, buf }, [buf]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err.message || err) });
  }
};
