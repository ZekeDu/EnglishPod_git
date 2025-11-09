import { track } from './track';

type QueueItem = { type: 'progress'; payload: any };

const KEY = 'ep_offline_queue_v1';

function readQ(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function saveQ(q: QueueItem[]) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {} }

export function enqueue(item: QueueItem) {
  const q = readQ(); q.push(item); saveQ(q);
}

export async function flushQueue() {
  if (!navigator.onLine) return;
  const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
  const q = readQ();
  const rest: QueueItem[] = [];
  for (const it of q) {
    try {
      const { lessonId, mode, value } = it.payload || {};
      await fetch(`${API}/progress/lesson/${lessonId}/mark?mode=${encodeURIComponent(mode)}&value=${encodeURIComponent(String(value))}`, { method: 'POST' });
    } catch { rest.push(it); }
  }
  saveQ(rest);
  if (q.length > 0) track('offline_sync', { total: q.length, left: rest.length });
}

export function initOfflineSync() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => { flushQueue(); });
  // 定时器兜底
  setInterval(() => { flushQueue(); }, 10000);
}
