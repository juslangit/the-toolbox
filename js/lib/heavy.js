// Big downloads (video engine, AI models) are fetched only when a tool needs
// them, and only after the person agrees. The service worker keeps them, so
// the second time they load from the device and work offline.
import { h } from '../ui.js';

const key = id => 'toolbox.heavy.' + id;
export const isFetched = id => { try { return localStorage.getItem(key(id)) === '1'; } catch { return false; } };
export const markFetched = id => { try { localStorage.setItem(key(id), '1'); } catch {} };

// Shows a card asking to download `what` (about `mb` MB). Resolves once the
// person taps the button — straight away if it was fetched before.
export function askToFetch(root, { id, what, mb, why }) {
  if (isFetched(id)) return Promise.resolve();
  return new Promise(resolve => {
    const btn = h('button', { class: 'btn primary', type: 'button' }, `Download ${what} (about ${mb} MB)`);
    const el = h('section', { class: 'card heavy-ask' },
      h('h3', {}, 'One-time download'),
      h('p', {}, why || `This tool needs ${what}. It is downloaded once, kept on this device, and then works offline. Your files never leave the device.`),
      btn);
    btn.onclick = () => { el.remove(); resolve(); };
    root.prepend(el);
  });
}

// transformers.js (Apache-2.0) from jsDelivr: runs AI models in the browser.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm';
let tf;
export async function transformers() {
  if (!tf) {
    tf = await import(TRANSFORMERS);
    tf.env.allowLocalModels = false;
    tf.env.useBrowserCache = true;
  }
  return tf;
}
