import { PrismaClient } from '@prisma/client';
import { nextSchedule, type Card, type Schedule } from './srs';

export interface SRSStore {
  today(userId: string, cards: Card[], limit?: number): Promise<{ card: Card; schedule: Schedule }[]>;
  submit(userId: string, cardId: string, rating: 0 | 1 | 2 | 3 | 4): Promise<Schedule>;
  add(userId: string, cardId: string): Promise<boolean>;
  remove(userId: string, cardId: string): Promise<boolean>;
  reset(userId: string): Promise<boolean>;
  stats(userId: string): Promise<{ total: number; due: number; mastered: number; learning: number }>;
  collection(userId: string): Promise<string[]>;
}

class DbSRS implements SRSStore {
  constructor(private readonly prisma: PrismaClient) {}

  async today(userId: string, cards: Card[], limit = 20) {
    const dueRows = await this.prisma.review.findMany({
      where: { user_id: userId, due_at: { lte: new Date() } },
      orderBy: { due_at: 'asc' },
      take: limit,
    });
    const byId = new Map(cards.map((c) => [c.id, c] as const));
    const result: { card: Card; schedule: Schedule }[] = [];
    for (const s of dueRows) {
      const card = byId.get(s.card_id);
      if (!card) continue;
      result.push({
        card,
        schedule: {
          card_id: s.card_id,
          repetitions: s.repetitions,
          interval: s.interval,
          ef: s.ef,
          due_at: s.due_at.toISOString(),
        },
      });
    }
    return result;
  }

  async submit(userId: string, cardId: string, rating: 0 | 1 | 2 | 3 | 4) {
    const cur = await this.prisma.review.findUnique({
      where: { user_id_card_id: { user_id: userId, card_id: cardId } },
    });
    const next = nextSchedule(
      cur
        ? {
            card_id: cur.card_id,
            repetitions: cur.repetitions,
            interval: cur.interval,
            ef: cur.ef,
            due_at: cur.due_at.toISOString(),
          }
        : undefined,
      rating,
    );

    await this.prisma.$transaction([
      this.prisma.review.upsert({
        where: { user_id_card_id: { user_id: userId, card_id: cardId } },
        update: {
          repetitions: next.repetitions,
          interval: next.interval,
          ef: next.ef,
          due_at: new Date(next.due_at),
        },
        create: {
          user_id: userId,
          card_id: cardId,
          repetitions: next.repetitions,
          interval: next.interval,
          ef: next.ef,
          due_at: new Date(next.due_at),
        },
      }),
      this.prisma.reviewLog.create({ data: { user_id: userId, card_id: cardId, rating, meta: {} } }),
    ]);

    return next;
  }

  async add(userId: string, cardId: string) {
    const now = new Date();
    await this.prisma.review.upsert({
      where: { user_id_card_id: { user_id: userId, card_id: cardId } },
      update: { due_at: now },
      create: { user_id: userId, card_id: cardId, due_at: now },
    });
    return true;
  }

  async remove(userId: string, cardId: string) {
    await this.prisma.review.deleteMany({ where: { user_id: userId, card_id: cardId } });
    await this.prisma.reviewLog.deleteMany({ where: { user_id: userId, card_id: cardId } });
    return true;
  }

  async reset(userId: string) {
    const now = new Date();
    await this.prisma.review.updateMany({ where: { user_id: userId }, data: { due_at: now } });
    return true;
  }

  async stats(userId: string) {
    const total = await this.prisma.review.count({ where: { user_id: userId } });
    const due = await this.prisma.review.count({ where: { user_id: userId, due_at: { lte: new Date() } } });
    const mastered = await this.prisma.review.count({
      where: { user_id: userId, repetitions: { gte: 3 }, interval: { gte: 21 } },
    });
    const learning = Math.max(0, total - mastered);
    return { total, due, mastered, learning };
  }

  async collection(userId: string) {
    const rows = await this.prisma.review.findMany({
      where: { user_id: userId },
      select: { card_id: true },
    });
    return rows.map((r) => r.card_id);
  }
}

let cachedStore: SRSStore | null = null;

export function getSRSStore(prisma: PrismaClient): SRSStore {
  if (!cachedStore) {
    cachedStore = new DbSRS(prisma);
  }
  return cachedStore;
}
