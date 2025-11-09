import * as fs from 'fs';
import * as path from 'path';

function resolveDataDir(): string {
  const envDir = process.env.DATA_DIR;
  const candidates = (
    [
      envDir,
      // Prefer repo root data when running from apps/api-nest
      path.resolve(process.cwd(), '../../data'),
      path.resolve(__dirname, '../../..', 'data'),
      // Fallback: local data folder under current app
      path.join(process.cwd(), 'data'),
    ].filter(Boolean) as string[]
  ).filter((p, i, arr) => arr.indexOf(p) === i);

  // First, try candidates that actually contain lessons
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'lessons'))) return c;
    } catch {}
  }
  // Next, any existing candidate
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  // Last resort: relative data
  return path.join(process.cwd(), 'data');
}

export const DATA_DIR = resolveDataDir();

function readJSONSafe<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch (e) {
    return null;
  }
}

export function readIndex() {
  // 1) Prefer index.json for ordering and curation
  const lessonsDir = path.join(DATA_DIR, 'lessons');
  const indexPath = path.join(lessonsDir, 'index.json');
  const fromFile = readJSONSafe<any[]>(indexPath);
  const list: any[] = Array.isArray(fromFile)
    ? fromFile.map((it) => ({ ...it, published: !!it.published }))
    : [];

  // 2) Supplement by scanning directories and adding any missing lesson IDs
  try {
    const ids = fs
      .readdirSync(lessonsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => e.name);

    const existingIds = new Set(list.map((it) => String(it.id ?? it.lessonNo ?? '')));
    for (const id of ids) {
      if (existingIds.has(id)) continue;
      const meta = readJSONSafe<any>(path.join(lessonsDir, id, 'meta.json')) || {};
      list.push({
        id,
        lessonNo: meta.lesson_no || meta.lessonNo || Number(id),
        title: meta.title || `Lesson ${id}`,
        level: meta.level || 'Unknown',
        duration: meta.duration || 0,
        tags: meta.tags || [],
        published: !!meta.published,
      });
    }
  } catch {}

  return list.map((it) => ({ ...it, published: !!it.published }));
}

export function readLessonMeta(id: string) {
  return readJSONSafe<any>(path.join(DATA_DIR, 'lessons', id, 'meta.json'));
}

export function readTranscript(id: string) {
  return readJSONSafe<any>(path.join(DATA_DIR, 'lessons', id, 'transcript.json'));
}
