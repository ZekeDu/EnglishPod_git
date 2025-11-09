import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { getSRSStore } from './srsStore';

interface MarkResult {
  completed: boolean;
  listen_sec: number;
  score: number;
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfDayUTC(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private key(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
      date.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  async markProgress(params: {
    userId: string;
    lessonId: string;
    mode: 'listen' | 'score';
    value: number;
  }): Promise<MarkResult> {
    const { userId, lessonId, mode } = params;
    const increment = Number.isFinite(params.value) ? params.value : 1;
    const now = new Date();
    const startOfToday = this.startOfDayUTC(now);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.userProgress.findUnique({
        where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
      });

      let listenSec = existing?.listen_sec ?? 0;
      let score = existing?.score ?? 0;
      if (mode === 'listen') listenSec += increment;
      if (mode === 'score') score += increment;
      const completed = listenSec >= 120 || score >= 2;

      await tx.userProgress.upsert({
        where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
        create: {
          user_id: userId,
          lesson_id: lessonId,
          listen_sec: listenSec,
          score,
          completed,
          updated_at: now,
        },
        update: {
          listen_sec: listenSec,
          score,
          completed,
          updated_at: now,
        },
      });

      await tx.userDailyProgress.upsert({
        where: { user_id_date: { user_id: userId, date: startOfToday } },
        create: { user_id: userId, date: startOfToday, completed },
        update: completed ? { completed: true } : {},
      });

      return { completed, listen_sec: listenSec, score };
    });
  }

  async getSummary(userId: string) {
    const rows = await this.prisma.userDailyProgress.findMany({
      where: { user_id: userId },
    });
    const completedMap = new Map<string, boolean>();
    rows.forEach((row) => {
      const key = this.key(row.date);
      completedMap.set(key, !!row.completed);
    });

    const today = new Date();
    let streak = 0;
    const cursor = new Date(today);
    while (true) {
      const key = this.key(cursor);
      if (completedMap.get(key)) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else {
        break;
      }
    }

    const week: { date: string; completed: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - i);
      const key = this.key(day);
      week.push({ date: key, completed: !!completedMap.get(key) });
    }

    const progressRows = await this.prisma.userProgress.findMany({
      where: { user_id: userId },
      select: { completed: true, listen_sec: true, score: true },
    });
    const totalLessons = progressRows.length;
    const completedLessons = progressRows.filter((row) => row.completed).length;
    const inProgressLessons = progressRows.filter(
      (row) => !row.completed && ((row.listen_sec ?? 0) > 0 || (row.score ?? 0) > 0),
    ).length;

    const latestProgress = await this.prisma.userProgress.findFirst({
      where: { user_id: userId },
      orderBy: { updated_at: 'desc' },
      include: { lesson: { select: { id: true, lesson_no: true, title: true } } },
    });

    const store = getSRSStore(this.prisma);
    const reviewStats = await store.stats(userId);
    const clearedToday =
      reviewStats.total > 0 ? reviewStats.due === 0 : false;

    return {
      streak,
      week,
      lessons: {
        total: totalLessons,
        completed: completedLessons,
        inProgress: inProgressLessons,
      },
      reviews: {
        total: reviewStats.total,
        due: reviewStats.due,
        learning: reviewStats.learning,
        mastered: reviewStats.mastered,
        clearedToday,
      },
      recentLesson: latestProgress?.lesson
        ? {
            id: latestProgress.lesson.id,
            lessonNo: latestProgress.lesson.lesson_no,
            title: latestProgress.lesson.title,
          }
        : null,
    };
  }
}
