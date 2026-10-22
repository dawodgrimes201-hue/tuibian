/* 蜕变 · 离线版 Service Worker：装一次，之后断网也能用 */
const VERSION = 'tb-offline-v5-20261022';
const SHELL = [
  './', 'index.html', 'style.css', 'data.js', 'coach.js', 'rules.js',
  'voice.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isVoiceClip = /\/voice\/(female|male)\/[a-f0-9]+\.mp3$/.test(url.pathname);
  const isManifestJson = url.pathname.endsWith('/voice/manifest.json');
  const isNavigate = req.mode === 'navigate';

  // 语音片段：内容不会再变，缓存优先
  if (isVoiceClip) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 语音清单：联网优先，离线回退
  if (isManifestJson) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return (await cache.match(req)) || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // 页面和脚本：先给缓存（秒开、断网可用），后台顺手更新
  if (isNavigate || /\.(html|js|css|webmanifest|png)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      if (hit) return hit;
      const res = await network;
      return res || new Response('离线中', { status: 503 });
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
  if (event.data && event.data.type === 'ping' && event.source) {
    event.source.postMessage({ type: 'pong', version: VERSION });
  }
});
