import { enqueue, flushQueue } from './sync';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export async function markLessonProgress(lessonId: string, mode: 'listen' | 'score', value: number) {
  if (!lessonId) return;
  const safeValue = Number.isFinite(value) ? value : 1;
  try {
    const resp = await fetch(
      `${API}/progress/lesson/${encodeURIComponent(lessonId)}/mark?mode=${encodeURIComponent(mode)}&value=${encodeURIComponent(String(safeValue))}`,
      { method: 'POST', credentials: 'include' },
    );
    if (!resp.ok) throw new Error('progress_failed');
  } catch {
    enqueue({ type: 'progress', payload: { lessonId, mode, value: safeValue } });
    flushQueue();
  }
}
