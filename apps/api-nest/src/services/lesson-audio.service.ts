import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type LessonAudioKind = 'main' | 'podcast';

@Injectable()
export class LessonAudioService {
  constructor(private readonly prisma: PrismaService) {}

  async setAudio(params: { lessonId: string; kind: LessonAudioKind; url: string; duration?: number | null }) {
    const { lessonId, kind, url, duration } = params;
    await this.prisma.lessonAudio.upsert({
      where: { lesson_id_kind: { lesson_id: lessonId, kind } },
      update: { url, duration: duration ?? null, updated_at: new Date() },
      create: { lesson_id: lessonId, kind, url, duration: duration ?? null },
    });
  }

  async getAudio(lessonId: string, kind: LessonAudioKind) {
    return this.prisma.lessonAudio.findUnique({ where: { lesson_id_kind: { lesson_id: lessonId, kind } } });
  }

  async listAudio(lessonId: string) {
    return this.prisma.lessonAudio.findMany({ where: { lesson_id: lessonId } });
  }

  async removeAudio(lessonId: string, kind: LessonAudioKind) {
    await this.prisma.lessonAudio.delete({ where: { lesson_id_kind: { lesson_id: lessonId, kind } } }).catch(() => {});
  }
}
