// Offline support. Network first, so a new version shows up as soon as you are
// online; the cache is the fallback when there is no connection.
// tools/deploy.sh fills in the version and the full file list (tools/stamp-sw.mjs),
// so a new tool is cached for offline use without anyone editing this file.
const CACHE = 'toolbox-dev';
const FILES = ['./', 'index.html']; /* @files */

// Big downloads a few tools ask for (video engine, AI models) come from these
// hosts. They never change at a given URL, so they are served from the cache
// first and kept across versions — downloaded once, then offline for good.
const CDN = 'toolbox-cdn';
const CDN_HOSTS = /(^|\.)(jsdelivr\.net|huggingface\.co|hf\.co|unpkg\.com)$/;
const KEEP = [CACHE, CDN, 'transformers-cache'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('toolbox-') && !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    if (!CDN_HOSTS.test(url.hostname)) return;
    e.respondWith(caches.open(CDN).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
