const CACHE_PREFIX = 'ep365-lesson-cache-v1';

export async function cacheLesson(lessonId: string, urls: string[]) {
  if (!('caches' in window)) throw new Error('Cache API not supported');
  const cache = await caches.open(`${CACHE_PREFIX}-${lessonId}`);
  await cache.addAll(urls);
  return true;
}

export async function isLessonCached(lessonId: string, url: string) {
  if (!('caches' in window)) return false;
  const cache = await caches.open(`${CACHE_PREFIX}-${lessonId}`);
  const res = await cache.match(url, { ignoreSearch: true });
  return !!res;
}

export async function clearLessonCache(lessonId: string) {
  if (!('caches' in window)) return false;
  return caches.delete(`${CACHE_PREFIX}-${lessonId}`);
}

export async function listLessonCaches() {
  if (!('caches' in window)) return [] as { id: string; keys: string[] }[];
  const keys = await caches.keys();
  const out: { id: string; keys: string[] }[] = [];
  for (const k of keys) {
    const m = k.match(new RegExp(`^${CACHE_PREFIX}-(.+)$`));
    if (m && m[1]) {
      const cache = await caches.open(k);
      const reqs = await cache.keys();
      out.push({ id: m[1], keys: reqs.map(r => r.url) });
    }
  }
  return out;
}

export async function clearAllLessonCaches() {
  if (!('caches' in window)) return 0;
  const keys = await caches.keys();
  let n = 0;
  for (const k of keys) {
    if (k.startsWith(CACHE_PREFIX)) { await caches.delete(k); n++; }
  }
  return n;
}
