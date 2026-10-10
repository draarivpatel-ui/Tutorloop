/* TutorLoop service worker: caches the app shell so TutorLoop opens with no internet connection.
 * Data never goes through here: it stays in localStorage. Bump VERSION when shipping changes.
 *
 * TutorLoop is served from a sub-path (https://aariv.me/Tutorloop/) on an origin it shares with
 * other sites. Cache Storage is per-ORIGIN, not per-path, so this worker must only ever touch its
 * own caches and its own URLs:
 *   - cleanup deletes only old "tutorloop-" caches, never another app's caches;
 *   - only requests under this worker's scope are cached;
 *   - the offline index.html fallback is used for page navigations only, never for scripts/CSS. */
const PREFIX = 'tutorloop-';
const VERSION = PREFIX + 'v3';
const SCOPE = new URL('./', self.location.href).href;          // e.g. https://aariv.me/Tutorloop/
const INDEX = new URL('index.html', SCOPE).href;
const SHELL = ['./', 'index.html', 'styles.css', 'js/core.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates show up right away), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;   // not ours: let the browser handle it
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      if (req.mode === 'navigate') return c.match(INDEX);
      return new Response('', { status: 504, statusText: 'Offline' });
    })))
  );
});
