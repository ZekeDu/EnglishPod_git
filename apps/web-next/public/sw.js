const VERSION = 'v1';
const SHELL = [
  '/',
  '/styles/tokens.css',
  '/styles/global.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ep-shell-'+VERSION).then((c)=>c.addAll(SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !k.includes(VERSION)).map(k => caches.delete(k)))).then(()=>self.clients.claim())
  );
});

// 简单运行时缓存策略：
// - 音频与 lessons/vocab/transcript/podcast 接口：cache-first
// - 其他：network-first，失败回退缓存
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isAudio = url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav') || url.pathname.includes('/audio/');
  const isLessonApi = /\/lessons\/.+\/(transcript|vocab|podcast)/.test(url.pathname);
  if (e.request.method !== 'GET') return;
  if (isAudio || isLessonApi) {
    e.respondWith((async()=>{
      const cache = await caches.open('ep-runtime-'+VERSION);
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(e.request).catch(()=>null);
      if (res && res.ok) cache.put(e.request, res.clone());
      return res || new Response('', { status: 504 });
    })());
    return;
  }
  e.respondWith((async()=>{
    try { const res = await fetch(e.request); const cache = await caches.open('ep-runtime-'+VERSION); cache.put(e.request, res.clone()); return res; }
    catch { const hit = await caches.match(e.request, { ignoreSearch: true }); return hit || new Response('', { status: 504 }); }
  })());
});

