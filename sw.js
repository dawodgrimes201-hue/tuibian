/* 蜕变 · 离线版 Service Worker
   - 外壳（页面/脚本）跟版本走，更新时换新的
   - 语音片段单独放一个长期缓存，更新不会清掉（不用重新下离线包）
*/
const VERSION = 'tb-offline-20261022111613';
const CACHE_SHELL = VERSION;
const CACHE_AUDIO = 'tb-audio-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'data.js', 'coach.js', 'rules.js',
  'voice.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // 先把旧缓存里的语音片段迁移到长期缓存，避免更新后要重下离线包
    try {
      const audio = await caches.open(CACHE_AUDIO);
      const have = new Set((await audio.keys()).map(r => new URL(r.url).pathname));
      for (const k of keys) {
        if (!k.startsWith('tb-offline-') || k === CACHE_SHELL) continue;
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          const u = new URL(req.url);
          if (!/\.mp3$/.test(u.pathname) || have.has(u.pathname)) continue;
          const res = await old.match(req);
          if (res) { await audio.put(req, res); have.add(u.pathname); }
        }
      }
    } catch (e) {}
    await Promise.all(keys.filter(k => k !== CACHE_SHELL && k !== CACHE_AUDIO).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function cacheVoice(req) {
  return (async () => {
    const cache = await caches.open(CACHE_AUDIO);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isVoiceClip = /\/voice\/(female|male)\/[a-f0-9]+\.mp3$/.test(url.pathname);
  const isManifestJson = url.pathname.endsWith('/voice/manifest.json');
  const isNavigate = req.mode === 'navigate';

  if (isVoiceClip) { event.respondWith(cacheVoice(req)); return; }

  if (isManifestJson) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_SHELL);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return (await cache.match(req)) || (await (await caches.open(CACHE_AUDIO)).match(req)) ||
          new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  if (isNavigate || /\.(html|js|css|webmanifest|png)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_SHELL);
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
