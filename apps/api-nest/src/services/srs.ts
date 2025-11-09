import * as fs from 'fs';
import * as path from 'path';

type Rating = 0|1|2|3|4;

export interface Schedule {
  card_id: string;
  repetitions: number;
  interval: number; // days
  ef: number; // ease factor
  due_at: string; // ISO date
  last_answer?: Rating;
}

export interface Card {
  id: string;
  phrase: string;
  meaning?: string;
  examples?: string[];
}

export function normalizeCardId(id: string) {
  return (id || '').trim().toLowerCase();
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

export function nextSchedule(s: Schedule | undefined, rating: Rating): Schedule {
  const now = new Date();
  if (!s) {
    s = { card_id: '', repetitions: 0, interval: 0, ef: 2.5, due_at: now.toISOString() } as Schedule;
  }
  let { repetitions, interval, ef } = s;
  if (rating < 2) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 3;
    else interval = Math.round(interval * ef) || 1;
    repetitions += 1;
  }
  ef = clamp(ef + (0.1 - (4 - rating) * (0.08 + (4 - rating) * 0.02)), 1.3, 2.8);
  const due = new Date(now.getTime() + interval * 86400000);
  return { ...s, repetitions, interval, ef, due_at: due.toISOString(), last_answer: rating };
}

function userDir(userId: string) {
  const baseCandidates = [
    path.join(process.cwd(), 'data'),
    path.resolve(process.cwd(), '../../data'),
    path.resolve(__dirname, '../../..', 'data'),
  ];
  const base = baseCandidates.find(d => fs.existsSync(d)) || path.join(process.cwd(), 'data');
  const dir = path.join(base, 'users', userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadUserSRS(userId: string): Record<string, Schedule> {
  const p = path.join(userDir(userId), 'srs.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

export function saveUserSRS(userId: string, data: Record<string, Schedule>) {
  const p = path.join(userDir(userId), 'srs.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

export function todayItems(userId: string, cards: Card[], limit = 20): {card: Card, schedule: Schedule}[] {
  const srs = loadUserSRS(userId);
  const now = new Date();
  const due = Object.values(srs)
    .filter(s => new Date(s.due_at) <= now)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    .slice(0, limit);
  const byId = new Map(cards.map(c => [normalizeCardId(c.id), c] as const));
  const result: { card: Card; schedule: Schedule }[] = [];
  let mutated = false;
  for (const schedule of due) {
    const card = byId.get(schedule.card_id);
    if (!card) {
      delete srs[schedule.card_id];
      mutated = true;
      continue;
    }
    result.push({ card, schedule });
  }
  if (mutated) saveUserSRS(userId, srs);
  return result;
}
