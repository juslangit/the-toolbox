// Offline support. Network first, so a new version shows up as soon as you are
// online; the cache is the fallback when there is no connection.
// tools/deploy.sh fills in the version and the full file list (tools/stamp-sw.mjs),
// so a new tool is cached for offline use without anyone editing this file.
const CACHE = 'toolbox-dev';
const FILES = ['./', 'index.html']; /* @files */

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
