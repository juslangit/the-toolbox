// On-device background removal for the Background remover tool and the
// img-bg-remove workflow step. The model is fetched from Hugging Face the
// first time (after the person agrees) and cached by the browser.
import { transformers, isFetched } from './heavy.js';
import { canvas, ctx2d } from './fx-core.js';

// ormbg ("Open Remove Background Model", Apache-2.0, an ISNet/DIS model by
// schirrmacher). Chosen because it also runs without WebGPU (iPhone Safari 17):
// BiRefNet lite (MIT) ran out of memory on the processor path.
export const BG = {
  id: 'bg-model-ormbg',               // askToFetch / markFetched id
  model: 'onnx-community/ormbg-ONNX',
  dtype: 'fp16',
  mb: 88,
};

let loading = null;
let device = null;
let gpuFailed = false;

async function pickDevice() {
  if (gpuFailed) return 'wasm';
  try {
    if (navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu';
  } catch {}
  return 'wasm';
}

// Loads (once) the segmentation pipeline. onProgress(0..1, label).
export function loadRemover(onProgress = () => {}) {
  if (!loading) {
    loading = (async () => {
      const tf = await transformers();
      device = await pickDevice();
      const files = {};
      const progress_callback = p => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const all = Object.values(files);
          const done = all.reduce((s, [l]) => s + l, 0), total = all.reduce((s, [, t]) => s + t, 0);
          onProgress(done / total, `Downloading the model… ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
        }
      };
      const make = () => tf.pipeline('background-removal', BG.model, { device, dtype: BG.dtype, progress_callback });
      try {
        return await make();
      } catch (e) {
        if (device === 'wasm') throw e;
        gpuFailed = true; device = 'wasm'; // a GPU that cannot run it — fall back to the processor
        return await make();
      }
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

export const usedDevice = () => device;
export const modelReady = () => isFetched(BG.id);

// Returns a canvas the size of img with the background made transparent.
export async function removeBackground(img, onProgress) {
  const seg = await loadRemover(onProgress);
  const tf = await transformers();
  const W = img.w || img.width, H = img.h || img.height;
  const src = canvas(W, H);
  ctx2d(src).drawImage(img, 0, 0, W, H);
  onProgress?.(1, `Finding the subject (on the ${device === 'webgpu' ? 'graphics chip' : 'processor'})…`);
  const raw = tf.RawImage.fromCanvas(src);
  let res;
  try {
    res = await seg(raw);
  } catch (e) {
    if (device !== 'webgpu') throw e;
    // Some graphics chips load the model but cannot run it (too few shader
    // buffers, lost device…). Start again on the processor.
    gpuFailed = true; loading = null;
    try { seg.dispose?.(); } catch {}
    onProgress?.(1, 'The graphics chip could not run it — using the processor instead (slower)…');
    const cpu = await loadRemover(onProgress);
    res = await cpu(raw);
  }
  if (Array.isArray(res)) res = res[0];
  // res is RGBA at the original size; copy its alpha onto our pixels.
  const out = canvas(W, H), x = ctx2d(out, true);
  x.drawImage(src, 0, 0);
  const id = x.getImageData(0, 0, W, H);
  const a = res.channels === 4 ? res.data : null;
  if (a && res.width === W && res.height === H) {
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = a[i];
  } else {
    // Unexpected shape: scale the mask through a canvas.
    const mc = res.toCanvas();
    const m = canvas(W, H), mx = ctx2d(m, true);
    mx.drawImage(mc, 0, 0, W, H);
    const md = mx.getImageData(0, 0, W, H).data;
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = res.channels === 4 ? md[i] : md[i - 3];
  }
  x.putImageData(id, 0, 0);
  return out;
}
