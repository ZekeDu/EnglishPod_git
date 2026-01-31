#!/usr/bin/env node
/**
 * Migrate legacy data/media/lesson-audio.json into the LessonAudio table.
 * Usage: node tools/migrate-lesson-audio.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const file = path.join(process.cwd(), 'data', 'media', 'lesson-audio.json');
  if (!fs.existsSync(file)) {
    console.log('[migrate-lesson-audio] No legacy lesson-audio.json found, nothing to do.');
    await prisma.$disconnect();
    return;
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf-8')) || {};
  let total = 0;
  for (const [lessonId, kinds] of Object.entries(json)) {
    if (!lessonId) continue;
    for (const [kind, payload] of Object.entries(kinds || {})) {
      if (!payload || !payload.url) continue;
      const url = String(payload.url);
      const duration = payload.duration != null ? Number(payload.duration) : null;
      await prisma.lessonAudio.upsert({
        where: { lesson_id_kind: { lesson_id: lessonId, kind } },
        update: { url, duration, updated_at: new Date() },
        create: { lesson_id: lessonId, kind, url, duration },
      });
      total += 1;
      console.log(`[migrate-lesson-audio] upsert ${lessonId}:${kind} -> ${url}`);
    }
  }
  console.log(`[migrate-lesson-audio] completed, migrated ${total} records.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[migrate-lesson-audio] failed:', err);
  process.exit(1);
});
