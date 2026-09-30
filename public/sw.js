/* Offline shell. Page files: network first (so a deploy shows up at once), cache when there's no signal.
   Fonts: cached copy first, refreshed in the background. /api: always the network; the page keeps its own copy of the plan. */
const CACHE = 'trip-shell-v1';
const SHELL = ['/', '/index.html', '/app.css', '/app.js', '/trip.js', '/shim.js', '/deals.js', '/explore.js', '/today.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'trip-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? '/index.html' : url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? '/index.html' : url.pathname, { ignoreSearch: true }).then(r => r || Response.error())));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('trip-fonts').then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
