// Offline support. Network first, so a new version shows up as soon as you are
// online; the cache is the fallback when there is no connection.
const CACHE = 'toolbox-v1';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/ui.js', 'js/icons.js',
  'js/tools/crypto.js', 'js/tools/convert.js', 'js/tools/dev.js', 'js/tools/everyday.js',
  'vendor/bcryptjs.js', 'vendor/cronstrue.js', 'vendor/diff.js', 'vendor/js-yaml.js',
  'vendor/md5.js', 'vendor/papaparse.js', 'vendor/qrcode.js', 'vendor/smol-toml.js',
  'fonts/bricolage.woff2', 'fonts/jetbrains-mono.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
