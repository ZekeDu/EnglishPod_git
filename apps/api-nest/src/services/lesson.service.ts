import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type LessonSnapshot = {
  meta: any;
  transcript: any;
  vocab: any;
  practice: { cloze?: any; essay?: any };
  podcast?: { meta?: any; transcript?: any } | null;
};

@Injectable()
export class LessonService {
  constructor(private readonly prisma: PrismaService) {}

  async listLessons() {
    const rows = await this.prisma.lesson.findMany({
      orderBy: [{ lesson_no: 'asc' }],
      select: {
        id: true,
        lesson_no: true,
        title: true,
        level: true,
        tags: true,
        duration: true,
        published: true,
        updated_at: true,
      },
    });
    return rows.map((r) => ({
      id: String(r.id),
      lessonNo: r.lesson_no,
      title: r.title,
      level: r.level,
      tags: Array.isArray(r.tags) ? r.tags : r.tags || [],
      duration: r.duration || 0,
      published: !!r.published,
      updated_at:
        (r.updated_at instanceof Date ? r.updated_at.toISOString() : (r as any).updated_at) || null,
    }));
  }

  async getLessonMeta(id: string) {
    return this.prisma.lesson.findUnique({ where: { id: String(id) } });
  }

  async getTranscriptOnly(id: string) {
    const doc = await this.prisma.transcript.findUnique({ where: { lesson_id: String(id) } });
    return doc ? { segments: doc.segments } : null;
  }

  async getVocabOnly(id: string) {
    const doc = await this.prisma.vocab.findUnique({ where: { lesson_id: String(id) } });
    return doc ? { cards: doc.cards } : null;
  }

  async getLessonFull(id: string) {
    const lessonId = String(id);
    const [meta, transcript, vocab, practice, podcast] = await Promise.all([
      this.prisma.lesson.findUnique({ where: { id: lessonId } }),
      this.prisma.transcript.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.vocab.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.practice.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.lessonPodcast.findUnique({ where: { lesson_id: lessonId } }),
    ]);
    return {
      meta,
      transcript: transcript ? { segments: transcript.segments } : null,
      vocab: vocab ? { cards: vocab.cards } : null,
      practice: practice ? { cloze: practice.cloze || null, essay: practice.essay || null } : { cloze: null, essay: null },
      podcast: podcast
        ? { meta: podcast.meta ?? null, transcript: podcast.transcript ?? null }
        : null,
    };
  }

  async listHistory(id: string) {
    const history = await this.prisma.lessonHistory.findMany({
      where: { lesson_id: String(id) },
      orderBy: { created_at: 'desc' },
      select: { id: true, version: true, reason: true, created_at: true },
    });
    return history.map((h) => ({
      id: h.id,
      version: h.version,
      reason: h.reason || '',
      created_at: h.created_at instanceof Date ? h.created_at.toISOString() : (h as any).created_at,
    }));
  }

  async getHistoryEntry(lessonId: string, historyId: string) {
    return this.prisma.lessonHistory.findFirst({
      where: { lesson_id: String(lessonId), id: historyId },
    });
  }

  private async fetchSnapshot(id: string): Promise<LessonSnapshot> {
    const lessonId = String(id);
    const [meta, transcript, vocab, practice, podcast] = await Promise.all([
      this.prisma.lesson.findUnique({ where: { id: lessonId } }),
      this.prisma.transcript.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.vocab.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.practice.findUnique({ where: { lesson_id: lessonId } }),
      this.prisma.lessonPodcast.findUnique({ where: { lesson_id: lessonId } }),
    ]);
    return {
      meta,
      transcript: transcript ? { segments: transcript.segments } : null,
      vocab: vocab ? { cards: vocab.cards } : null,
      practice: {
        cloze: practice?.cloze || null,
        essay: practice?.essay || null,
      },
      podcast: podcast
        ? {
            meta: podcast.meta ?? null,
            transcript: podcast.transcript ?? null,
          }
        : null,
    };
  }

  async createHistory(id: string, reason: string) {
    const snapshot = await this.fetchSnapshot(id);
    const version = Number(snapshot.meta?.version || 0);
    return this.prisma.lessonHistory.create({
      data: {
        lesson_id: String(id),
        version,
        reason,
        snapshot,
      },
    });
  }

  async restoreFromHistory(lessonId: string, historyId: string) {
    const history = await this.getHistoryEntry(lessonId, historyId);
    if (!history) throw new Error('history_not_found');
    const snapshot = (history.snapshot || {}) as LessonSnapshot;
    const lessonData = snapshot.meta;
    const lesson_id = String(lessonId);
    return this.prisma.$transaction(async (tx) => {
      if (lessonData) {
        await tx.lesson.upsert({
          where: { id: lesson_id },
          create: {
            id: lesson_id,
            lesson_no: Number(lessonData.lesson_no || lessonData.lessonNo || lesson_id),
            title: lessonData.title || `Lesson ${lesson_id}`,
            level: lessonData.level || null,
            tags: lessonData.tags || [],
            duration: lessonData.duration || 0,
            audio_url: lessonData.audio_url || '',
            status: lessonData.status || (lessonData.published ? 'published' : 'draft'),
            version: Number(lessonData.version || 1),
            published: !!lessonData.published,
            published_at: lessonData.published_at ? new Date(lessonData.published_at) : null,
          },
          update: {
            lesson_no: Number(lessonData.lesson_no || lessonData.lessonNo || lesson_id),
            title: lessonData.title || `Lesson ${lesson_id}`,
            level: lessonData.level || null,
            tags: lessonData.tags || [],
            duration: lessonData.duration || 0,
            audio_url: lessonData.audio_url || '',
            status: lessonData.status || (lessonData.published ? 'published' : 'draft'),
            version: Number(lessonData.version || 1),
            published: !!lessonData.published,
            published_at: lessonData.published_at ? new Date(lessonData.published_at) : null,
            updated_at: new Date(),
          },
        });
      }
      if (snapshot.transcript) {
        await tx.transcript.upsert({
          where: { lesson_id },
          create: { lesson_id, segments: snapshot.transcript.segments || [] },
          update: { segments: snapshot.transcript.segments || [] },
        });
      }
      if (snapshot.vocab) {
        await tx.vocab.upsert({
          where: { lesson_id },
          create: { lesson_id, cards: snapshot.vocab.cards || [] },
          update: { cards: snapshot.vocab.cards || [] },
        });
      }
      if (snapshot.practice) {
        await tx.practice.upsert({
          where: { lesson_id },
          create: {
            lesson_id,
            cloze:
              snapshot.practice.cloze !== undefined
                ? snapshot.practice.cloze
                : Prisma.JsonNull,
            essay:
              snapshot.practice.essay !== undefined
                ? snapshot.practice.essay
                : Prisma.JsonNull,
          },
          update: {
            cloze:
              snapshot.practice.cloze !== undefined
                ? snapshot.practice.cloze
                : Prisma.JsonNull,
            essay:
              snapshot.practice.essay !== undefined
                ? snapshot.practice.essay
                : Prisma.JsonNull,
          },
        });
      }
      if (Object.prototype.hasOwnProperty.call(snapshot, 'podcast')) {
        const podcastData = snapshot.podcast;
        if (podcastData) {
          await tx.lessonPodcast.upsert({
            where: { lesson_id },
            create: {
              lesson_id,
              meta:
                podcastData.meta !== undefined
                  ? podcastData.meta
                  : Prisma.JsonNull,
              transcript:
                podcastData.transcript !== undefined
                  ? podcastData.transcript
                  : Prisma.JsonNull,
            },
            update: {
              meta:
                podcastData.meta !== undefined
                  ? podcastData.meta
                  : Prisma.JsonNull,
              transcript:
                podcastData.transcript !== undefined
                  ? podcastData.transcript
                  : Prisma.JsonNull,
            },
          });
        } else {
          await tx.lessonPodcast.delete({ where: { lesson_id } }).catch(() => {});
        }
      }
    });
  }

  async upsertLessonMeta(meta: any) {
    const id = String(meta.id || meta.lesson_id || meta.lessonId);
    if (!id) throw new Error('lesson_id_required');
    const lesson_no = Number(meta.lesson_no || meta.lessonNo || id);
    const now = new Date();
    const dto: Prisma.LessonUpsertArgs = {
      where: { id },
      create: {
        id,
        lesson_no,
        title: meta.title || `Lesson ${id}`,
        level: meta.level || null,
        tags: meta.tags || [],
        duration: Number(meta.duration || 0) || 0,
        audio_url: meta.audio_url || meta.audioUrl || '',
        status: meta.status || (meta.published ? 'published' : 'draft'),
        version: Number(meta.version || 1) || 1,
        published: !!meta.published,
        published_at: meta.published_at ? new Date(meta.published_at) : null,
      },
      update: {
        lesson_no,
        title: meta.title || `Lesson ${id}`,
        level: meta.level || null,
        tags: meta.tags || [],
        duration: Number(meta.duration || 0) || 0,
        audio_url: meta.audio_url || meta.audioUrl || '',
        status: meta.status || (meta.published ? 'published' : 'draft'),
        version: { increment: 1 },
        published: !!meta.published,
        published_at: meta.published_at ? new Date(meta.published_at) : null,
        updated_at: now,
      },
    };
    return this.prisma.lesson.upsert(dto);
  }

  async saveTranscript(id: string, payload: any) {
    const lesson_id = String(id);
    return this.prisma.transcript.upsert({
      where: { lesson_id },
      create: { lesson_id, segments: payload?.segments || [] },
      update: { segments: payload?.segments || [] },
    });
  }

  async saveVocab(id: string, payload: any) {
    const lesson_id = String(id);
    return this.prisma.vocab.upsert({
      where: { lesson_id },
      create: { lesson_id, cards: payload?.cards || [] },
      update: { cards: payload?.cards || [] },
    });
  }

  async savePractice(id: string, payload: { cloze?: any; essay?: any }) {
    const lesson_id = String(id);
    const clozeValue =
      payload && Object.prototype.hasOwnProperty.call(payload, 'cloze')
        ? payload.cloze
        : Prisma.JsonNull;
    const essayValue =
      payload && Object.prototype.hasOwnProperty.call(payload, 'essay')
        ? payload.essay
        : Prisma.JsonNull;
    return this.prisma.practice.upsert({
      where: { lesson_id },
      create: {
        lesson_id,
        cloze: clozeValue,
        essay: essayValue,
      },
      update: {
        cloze: clozeValue,
        essay: essayValue,
      },
    });
  }

  async getPodcast(id: string) {
    const row = await this.prisma.lessonPodcast.findUnique({ where: { lesson_id: String(id) } });
    if (!row) return null;
    return {
      meta: row.meta ?? null,
      transcript: row.transcript ?? null,
    };
  }

  async savePodcast(id: string, payload: { meta?: any; transcript?: any }) {
    const lesson_id = String(id);
    const hasMeta = payload && Object.prototype.hasOwnProperty.call(payload, 'meta');
    const hasTranscript = payload && Object.prototype.hasOwnProperty.call(payload, 'transcript');
    const metaValue = hasMeta ? payload.meta : Prisma.JsonNull;
    const transcriptValue = hasTranscript ? payload.transcript : Prisma.JsonNull;
    return this.prisma.lessonPodcast.upsert({
      where: { lesson_id },
      create: {
        lesson_id,
        meta: metaValue,
        transcript: transcriptValue,
      },
      update: {
        meta: metaValue,
        transcript: transcriptValue,
      },
    });
  }

  async publishLesson(id: string, publish = true, options?: { published_at?: string | Date }) {
    const published_at =
      publish && options?.published_at
        ? new Date(options.published_at)
        : publish
        ? new Date()
        : null;
    return this.prisma.lesson.update({
      where: { id: String(id) },
      data: {
        published: publish,
        status: publish ? 'published' : 'draft',
        published_at,
        updated_at: new Date(),
      },
    });
  }

  async createLesson(payload?: { id?: string; lesson_no?: number; title?: string }) {
    const requested = (payload?.id || '').trim();
    let id = requested;
    if (!/^\d+$/.test(id)) {
      const agg = await this.prisma.lesson.aggregate({ _max: { lesson_no: true } });
      const nextNo = (agg._max.lesson_no || 0) + 1;
      id = String(nextNo);
    }
    const lesson_no = payload?.lesson_no ?? Number(id);
    const now = new Date();
    try {
      await this.prisma.lesson.create({
        data: {
          id,
          lesson_no,
          title: payload?.title || `Lesson ${id}`,
          level: '',
          tags: [],
          audio_url: '',
          duration: 0,
          published: false,
          status: 'draft',
          version: 1,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new Error('lesson_exists');
      }
      throw err;
    }
    await this.prisma.transcript.create({ data: { lesson_id: id, segments: [] } }).catch(() => {});
    await this.prisma.vocab.create({ data: { lesson_id: id, cards: [] } }).catch(() => {});
    await this.prisma.practice
      .create({
        data: { lesson_id: id, cloze: Prisma.JsonNull, essay: Prisma.JsonNull },
      })
      .catch(() => {});
    return { id, lesson_no };
  }

  async deleteLesson(id: string) {
    const lessonId = String(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.practiceAttempt.deleteMany({ where: { lesson_id: lessonId } });
      await tx.userProgress.deleteMany({ where: { lesson_id: lessonId } });
      await tx.lessonHistory.deleteMany({ where: { lesson_id: lessonId } });
      await tx.lessonAudio.deleteMany({ where: { lesson_id: lessonId } });
      await tx.practice.deleteMany({ where: { lesson_id: lessonId } });
      await tx.lessonPodcast.deleteMany({ where: { lesson_id: lessonId } });
      await tx.vocab.deleteMany({ where: { lesson_id: lessonId } });
      await tx.transcript.deleteMany({ where: { lesson_id: lessonId } });
      return tx.lesson.delete({ where: { id: lessonId } });
    });
  }
}
