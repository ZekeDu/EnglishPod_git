#!/usr/bin/env node
/* Build-time sitemap generator
 * Reads lessons from API (NEXT_PUBLIC_API_BASE)
 * Writes to apps/web-next/public/sitemap.xml
 */
const fs = require('fs');
const path = require('path');


async function getLessonsFromApi() {
  const origin = process.env.SITE_ORIGIN || 'http://localhost:3000';
  const api = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'http://localhost:4000';
  try {
    const resp = await fetch(`${api}/lessons?includeDraft=false`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return list.map((item) => ({ id: String(item.id || item.lessonNo), title: item.title || `Lesson ${item.lessonNo}` }));
  } catch (err) {
    console.warn('[sitemap] fetch API failed:', err?.message || err);
    return null;
  }
}

async function getLessons() {
  const fromApi = await getLessonsFromApi();
  if (Array.isArray(fromApi)) return fromApi;
  return [];
}

async function main(){
  const origin = process.env.SITE_ORIGIN || 'http://localhost:3000';
  const lessons = await getLessons();
  const urls = [
    { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/review`, changefreq: 'daily', priority: '0.8' },
    { loc: `${origin}/settings/offline`, changefreq: 'weekly', priority: '0.5' },
  ];
  lessons.forEach(l => urls.push({ loc: `${origin}/lesson/${l.id}`, changefreq: 'weekly', priority: '0.7' }));

  const xml = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    .concat(urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`))
    .concat(['</urlset>']).join('\n');

  const out = path.resolve(__dirname, '../public/sitemap.xml');
  fs.writeFileSync(out, xml);
  // eslint-disable-next-line no-console
  console.log(`[sitemap] generated ${urls.length} urls at ${out}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[sitemap] failed:', err);
    process.exit(1);
  });
}
