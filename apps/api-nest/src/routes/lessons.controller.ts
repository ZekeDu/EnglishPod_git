import { Body, Controller, Get, Param, Put, Query, Req, Res } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response } from 'express';
import { LessonAudioService } from '../services/lesson-audio.service';
import { LessonService } from '../services/lesson.service';
import { DATA_DIR } from '../utils/data';
import { AuthService } from '../services/auth.service';

export const FREE_LESSON_IDS = new Set(
  Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, '0')),
);

@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessons: LessonService,
    private readonly lessonAudio: LessonAudioService,
    private readonly auth: AuthService,
  ) {}
  @Get()
  async list(@Req() req: Request, @Res() res: Response, @Query('query') query?: string, @Query('level') level?: string, @Query('tags') tags?: string, @Query('includeDraft') includeDraft?: string) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.auth.attachUserToRequest(req);
    } catch {}
    const user = this.auth.getUserFromRequest(req);
    const isAuthed = !!user;
    try {
      let data = await this.lessons.listLessons();
      const lockedIds = data
        .map((x: any) => String(x.id || x.lesson_no || '').padStart(3, '0'))
        .filter((idValue) => !FREE_LESSON_IDS.has(idValue));
      const q = (query || '').trim().toLowerCase();
      const lv = (level || '').trim().toLowerCase();
      const tagSet = new Set((tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean));
      const showDraft = isAuthed && (includeDraft || '').toLowerCase() === 'true';
      if (!showDraft) data = data.filter((x: any) => !!x.published);
      if (q) data = data.filter((x: any) => String(x.title || '').toLowerCase().includes(q));
      if (lv) data = data.filter((x: any) => String(x.level || '').toLowerCase() === lv);
      if (tagSet.size > 0) data = data.filter((x: any) => Array.isArray(x.tags) && x.tags.some((t: string) => tagSet.has(String(t).toLowerCase())));
      return res.json({ code: 200, message: 'ok', data, meta: { authenticated: isAuthed, freeLessonIds: Array.from(FREE_LESSON_IDS), lockedLessonIds: lockedIds } });
    } catch {
      res.status(500).json({ code:500, message:'error', data:{ error:'list failed' }});
    }
  }


  @Get(':id')
  async meta(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    try {
      await this.auth.attachUserToRequest(req);
    } catch {}
    const isAuthed = !!this.auth.getUserFromRequest(req);
    const normalizedId = String(id || '').padStart(3, '0');
    if (!isAuthed && !FREE_LESSON_IDS.has(normalizedId)) {
      return res.status(401).json({ code: 401, message: 'error', data: { error: 'login required' } });
    }
    (async ()=>{
      try {
        const data = await this.lessons.getLessonMeta(id);
        if (!data) return res.status(404).json({ code: 404, message: 'error', data: { error: 'Lesson not found' } });
        try {
          const a = await this.lessonAudio.getAudio(id, 'main');
          if (a?.url) {
            (data as any).audio_url = a.url.startsWith('local:uploads/') ? `/media/lesson/${id}/main` : a.url;
            if (a.duration != null) (data as any).duration = a.duration;
          }
        } catch {}
        return res.json({ code: 200, message: 'ok', data });
      } catch {
        return res.status(500).json({ code:500, message:'error', data:{ error:'load failed' }});
      }
    })();
    return;
  }

  @Get(':id/transcript')
  async transcript(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    try {
      await this.auth.attachUserToRequest(req);
    } catch {}
    const isAuthed = !!this.auth.getUserFromRequest(req);
    const normalizedId = String(id || '').padStart(3, '0');
    if (!isAuthed && !FREE_LESSON_IDS.has(normalizedId)) {
      return res.status(401).json({ code: 401, message: 'error', data: { error: 'login required' } });
    }
    (async ()=>{
      try {
        const data = await this.lessons.getTranscriptOnly(id);
        if (!data) return res.status(404).json({ code: 404, message: 'error', data: { error: 'Transcript not found' } });
        return res.json({ code: 200, message: 'ok', data });
      } catch {
        return res.status(500).json({ code:500, message:'error', data:{ error:'load failed' }});
      }
    })();
    return;
  }

  @Get(':id/aggregate')
  async aggregate(@Param('id') id: string, @Req() req: Request, @Res() res: Response, @Query('include') include?: string) {
    try {
      await this.auth.attachUserToRequest(req);
    } catch {}
    const isAuthed = !!this.auth.getUserFromRequest(req);
    const normalizedId = String(id || '').padStart(3, '0');
    if (!isAuthed && !FREE_LESSON_IDS.has(normalizedId)) {
      return res.status(401).json({ code: 401, message: 'error', data: { error: 'login required' } });
    }
    const inc = new Set((include || 'meta,transcript,vocab,practice').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    const out: any = {};
    const lessonDir = path.join(DATA_DIR, 'lessons', id);
    (async ()=>{
      const loadFull = inc.has('meta') || inc.has('transcript') || inc.has('vocab') || inc.has('practice');
      const full = loadFull ? await this.lessons.getLessonFull(id) : null;
      if (inc.has('meta')) {
        const meta = full?.meta || (await this.lessons.getLessonMeta(id));
        if (!meta) return res.status(404).json({ code: 404, message: 'error', data: { error: 'Lesson not found' } });
        const audio = await this.lessonAudio.getAudio(id, 'main');
        if (audio?.url) {
          (meta as any).audio_url = audio.url.startsWith('local:uploads/') ? `/media/lesson/${id}/main` : audio.url;
          if (audio.duration != null) (meta as any).duration = audio.duration;
        }
        out.meta = meta;
      }
      if (inc.has('transcript')) out.transcript = full?.transcript || (await this.lessons.getTranscriptOnly(id));
      if (inc.has('vocab')) out.vocab = full?.vocab || (await this.lessons.getVocabOnly(id));
      if (inc.has('practice')) out.practice = full?.practice || null;
      if (inc.has('podcast')) {
        let podcast = full?.podcast || (await this.lessons.getPodcast(id));
        if (!podcast || (!podcast.meta && !podcast.transcript)) {
          let podcastMeta: any = null;
          let podcastTranscript: any = null;
          try {
            const raw = fs.readFileSync(path.join(lessonDir, 'podcast_meta.json'), 'utf-8');
            podcastMeta = JSON.parse(raw);
          } catch {}
          try {
            const raw = fs.readFileSync(path.join(lessonDir, 'podcast_transcript.json'), 'utf-8');
            podcastTranscript = JSON.parse(raw);
          } catch {}
          if (podcastMeta || podcastTranscript) {
            podcast = { meta: podcastMeta, transcript: podcastTranscript };
          } else {
            podcast = null;
          }
        }
        if (podcast) {
          const podcastAudio = await this.lessonAudio.getAudio(id, 'podcast').catch(() => null);
          const metaValue = podcast.meta as any;
          if (metaValue && podcastAudio?.url) {
            metaValue.audio_url = podcastAudio.url.startsWith('local:uploads/')
              ? `/media/lesson/${id}/podcast`
              : podcastAudio.url;
            if (podcastAudio.duration != null) metaValue.duration = podcastAudio.duration;
          }
          out.podcast = podcast;
        }
      }
      return res.json({ code: 200, message: 'ok', data: out });
    })().catch(()=>res.status(500).json({ code:500, message:'error', data:{ error:'aggregate failed' }}));
    return;
  }

  // Dev-only: replace transcript segments (for alignment tool)
  @Put(':id/transcript')
  updateTranscript(@Param('id') id: string, @Body() body: any) {
    const segments = body?.segments;
    if (!Array.isArray(segments)) return { code: 400, message: 'error', data: { error: 'segments required' } };
    return this.lessons
      .saveTranscript(id, { segments })
      .then(() => ({ code: 200, message: 'ok', data: { updated: true } }))
      .catch(() => ({ code: 500, message: 'error', data: { error: 'update failed' } }));
  }
}
