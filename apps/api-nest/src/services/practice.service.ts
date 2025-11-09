import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface ClozeAttemptPayload {
  score: number;
  answers: { index: number; value: string }[];
  perItem: { index: number; correct: boolean; answer: any; analysis: string }[];
}

export interface EssayAttemptPayload {
  content: string;
  feedback: any;
  provider: string;
  model: string;
  latency_ms: number;
}

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  async saveClozeAttempt(userId: string, lessonId: string, payload: ClozeAttemptPayload) {
    return this.prisma.practiceAttempt.create({
      data: {
        user_id: userId,
        lesson_id: lessonId,
        type: 'cloze',
        cloze_score: payload.score,
        feedback: {
          answers: payload.answers || [],
          perItem: payload.perItem || [],
          score: payload.score,
        },
      },
    });
  }

  async saveEssayAttempt(userId: string, lessonId: string, payload: EssayAttemptPayload) {
    return this.prisma.practiceAttempt.create({
      data: {
        user_id: userId,
        lesson_id: lessonId,
        type: 'essay',
        essay_text: payload.content,
        feedback: payload.feedback,
        provider: payload.provider,
        model: payload.model,
        latency_ms: payload.latency_ms || null,
      },
    });
  }

  async getLatestState(userId: string, lessonId: string) {
    const [cloze, essay] = await Promise.all([
      this.prisma.practiceAttempt.findFirst({
        where: { user_id: userId, lesson_id: lessonId, type: 'cloze' },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.practiceAttempt.findFirst({
        where: { user_id: userId, lesson_id: lessonId, type: 'essay' },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { cloze, essay };
  }

  async clearAttempts(userId: string, lessonId: string) {
    await this.prisma.practiceAttempt.deleteMany({ where: { user_id: userId, lesson_id: lessonId } });
  }

  async listAttempts(userId: string, lessonId: string) {
    return this.prisma.practiceAttempt.findMany({
      where: { user_id: userId, lesson_id: lessonId },
      orderBy: { created_at: 'desc' },
    });
  }
}
