import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../services/prisma.service';
import { AuthService } from '../services/auth.service';
import { getSRSStore } from '../services/srsStore';
import { Card, normalizeCardId } from '../services/srs';

@Controller()
export class ReviewsController {
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

  private async loadAllCards(): Promise<Card[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { published: true },
      include: { vocab: true },
    });
    const cards: Card[] = [];
    rows.forEach((lesson) => {
      const lessonId = String(lesson.id);
      const vocabCards = (lesson.vocab?.cards || []) as any[];
      vocabCards.forEach((c, idx) => {
        const phrase = (c.word || c.phrase || '').toString();
        const meaning = (c.meaning || c.definition || '').toString();
        cards.push({
          id: normalizeCardId(c.id || `${lessonId}-${idx}`),
          phrase,
          meaning,
          examples: Array.isArray(c.examples) ? c.examples.map((x: any) => String(x)) : [],
        });
      });
    });
    return cards;
  }

  @Get('reviews/today')
  async getToday(@Req() req: Request, @Query('limit') limit?: string) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const cards = await this.loadAllCards();
    const store = getSRSStore(this.prisma);
    const items = await store.today(user.id, cards, limit ? Number(limit) : 15);
    const selected = items.slice(0, limit ? Number(limit) : 15);
    return { code: 200, message: 'ok', data: { items: selected } };
  }

  @Post('reviews/submit')
  async submit(@Req() req: Request, @Body() body: { card_id: string; rating: 0 | 1 | 2 | 3 | 4 }) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const store = getSRSStore(this.prisma);
    const ns = await store.submit(user.id, body.card_id, body.rating);
    return { code: 200, message: 'ok', data: { schedule: ns } };
  }

  @Post('reviews/add')
  async add(@Req() req: Request, @Body() body: { card_id: string }) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const { card_id } = body || ({} as any);
    if (!card_id) return { code: 400, message: 'error', data: { error: 'card_id required' } };
    const normalizedId = normalizeCardId(card_id);
    const store = getSRSStore(this.prisma);
    await store.add(user.id, normalizedId);
    return { code: 200, message: 'ok', data: { added: true } };
  }

  @Get('reviews/collection')
  async collection(@Req() req: Request) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const store = getSRSStore(this.prisma);
    const col = await store.collection(user.id);
    return { code: 200, message: 'ok', data: { card_ids: col.map((c: string) => normalizeCardId(c)) } };
  }

  @Post('reviews/remove')
  async remove(@Req() req: Request, @Body() body: { card_id: string }) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const { card_id } = body || ({} as any);
    if (!card_id) return { code: 400, message: 'error', data: { error: 'card_id required' } };
    const normalizedId = normalizeCardId(card_id);
    const store = getSRSStore(this.prisma);
    await store.remove(user.id, normalizedId);
    return { code: 200, message: 'ok', data: { removed: true } };
  }

  // Dev helper: set all existing cards due to now
  @Post('reviews/reset')
  async reset(@Req() req: Request) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const store = getSRSStore(this.prisma);
    await store.reset(user.id);
    return { code: 200, message: 'ok', data: { reset: true } };
  }

  // 近 30 天学习记录（简化）
  @Get('reviews/history')
  async history(@Req() req: Request) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const rows = await this.prisma.review.findMany({
      where: { user_id: user.id },
      select: { due_at: true },
    });
    const byDay: Record<string, number> = {};
    rows.forEach((row) => {
      const key = row.due_at.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    });
    const days: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 86400000);
      const key = t.toISOString().slice(0, 10);
      days.push({ date: key, count: byDay[key] || 0 });
    }
    return { code: 200, message: 'ok', data: { days } };
  }

  // 统计信息（总卡数/到期数）
  @Get('reviews/stats')
  async stats(@Req() req: Request) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const store = getSRSStore(this.prisma);
    const { total, due, mastered, learning } = await store.stats(user.id);
    return { code: 200, message: 'ok', data: { total, due, mastered, learning } };
  }
}
