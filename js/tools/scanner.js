import { h, note, card, row, tabs, copy } from '../ui.js';

// Reads WIFI:T:WPA;S:name;P:pass;; — the format phones use for WiFi QR codes.
function parseWifi(s) {
  if (!/^WIFI:/i.test(s)) return null;
  const out = {};
  for (const m of s.slice(5).matchAll(/([TSPH]):((?:\\.|[^;])*);/g)) out[m[1]] = m[2].replace(/\\(.)/g, '$1');
  return out;
}

const scanner = {
  id: 'qrscan', name: 'QR scanner', group: 'everyday', icon: 'scan-qr-code',
  desc: 'Read a QR code with the camera or from a photo or screenshot.',
  keywords: 'qr scan read decode camera reader photo screenshot wifi',
  render(root) {
    let jsQR = null, stream = null, raf = 0, last = 0;
    const mode = tabs([['camera', 'Camera'], ['image', 'Photo or screenshot']], 'camera', v => {
      camPane.hidden = v !== 'camera'; imgPane.hidden = v !== 'image';
      if (v !== 'camera') stop();
    });
    const err = note();
    const video = h('video', { class: 'scan-video', playsInline: true, muted: true, autoplay: true });
    video.setAttribute('playsinline', '');
    const frame = h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-box', 'aria-hidden': 'true' }));
    const startBtn = h('button', { class: 'btn primary', type: 'button' }, 'Start camera');
    const stopBtn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Stop');
    const camPane = h('div', { class: 'stack' }, frame, row(startBtn, stopBtn));
    const pick = h('label', { class: 'drop' }, h('input', { type: 'file', accept: 'image/*', hidden: true }), h('span', {}, 'Choose a photo or screenshot with a QR code, or drop one here'));
    const imgPane = h('div', { hidden: true }, pick);
    const result = h('section', { class: 'card scan-result', hidden: true });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const ready = import('../../vendor/jsqr.js').then(m => { jsQR = m.default; })
      .catch(() => err.error('Could not load the QR reader — are you offline on a first visit?'));

    function show(text) {
      const wifi = parseWifi(text);
      let isUrl = false;
      try { isUrl = ['http:', 'https:'].includes(new URL(text).protocol); } catch {}
      result.hidden = false;
      result.replaceChildren(...[
        h('span', { class: 'field-label' }, wifi ? 'WiFi network' : isUrl ? 'Link' : 'Text'),
        wifi
          ? h('dl', { class: 'kv' }, h('dt', {}, 'Network'), h('dd', {}, wifi.S || '—'), h('dt', {}, 'Password'), h('dd', {}, wifi.P || '(none)'), h('dt', {}, 'Security'), h('dd', {}, wifi.T || '—'))
          : h('pre', { class: 'mono-block' }, text),
        row(
          isUrl && h('a', { class: 'btn primary', href: text, target: '_blank', rel: 'noopener noreferrer' }, 'Open link'),
          h('button', { class: 'btn', type: 'button', onclick: () => copy(wifi?.P || text) }, wifi?.P ? 'Copy password' : 'Copy'),
          wifi && h('button', { class: 'btn', type: 'button', onclick: () => copy(text) }, 'Copy raw')),
        isUrl && h('p', { class: 'field-hint' }, `Check the address before opening: ${new URL(text).hostname}`),
      ].filter(Boolean));
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(60);
    }

    function decode(w, hh) {
      const img = ctx.getImageData(0, 0, w, hh);
      return jsQR(img.data, w, hh, { inversionAttempts: 'attemptBoth' });
    }

    function tick(t) {
      raf = requestAnimationFrame(tick);
      if (!jsQR || video.readyState < 2 || t - last < 120) return;
      last = t;
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale), hh = Math.round(video.videoHeight * scale);
      canvas.width = w; canvas.height = hh;
      ctx.drawImage(video, 0, 0, w, hh);
      const code = decode(w, hh);
      if (code?.data) { show(code.data); stop(); }
    }

    async function start() {
      err.clear();
      if (!navigator.mediaDevices?.getUserMedia) { err.error('This browser cannot use the camera here. Use “Photo or screenshot” instead.'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play();
        await ready;
        frame.classList.add('live');
        startBtn.hidden = true; stopBtn.hidden = false;
        result.hidden = true;
        raf = requestAnimationFrame(tick);
      } catch (e) {
        err.error(e.name === 'NotAllowedError' ? 'Camera permission was refused. Allow it in the browser settings, or use a photo.' : `Could not start the camera: ${e.message}`);
      }
    }
    function stop() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
      frame.classList.remove('live');
      startBtn.hidden = false; stopBtn.hidden = true;
      startBtn.textContent = 'Scan again';
    }
    startBtn.onclick = start;
    stopBtn.onclick = stop;

    async function readImage(file) {
      if (!file) return;
      await ready;
      if (!jsQR) return;
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const code = decode(canvas.width, canvas.height);
      if (code?.data) { err.clear(); show(code.data); }
      else { result.hidden = true; err.error('No QR code found in that picture. Try a sharper or closer shot.'); }
    }
    pick.querySelector('input').addEventListener('change', e => readImage(e.target.files[0]));
    pick.addEventListener('dragover', e => { e.preventDefault(); pick.classList.add('over'); });
    pick.addEventListener('dragleave', () => pick.classList.remove('over'));
    pick.addEventListener('drop', e => { e.preventDefault(); pick.classList.remove('over'); readImage(e.dataTransfer.files[0]); });

    root.append(card(mode, camPane, imgPane, err.el), result);
    // Turn the camera off when leaving the tool.
    return stop;
  },
};

export default [scanner];
export { parseWifi };
