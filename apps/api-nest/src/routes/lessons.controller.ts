import { Body, Controller, Get, Param, Put, Query, Res } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { LessonAudioService } from '../services/lesson-audio.service';
import { LessonService } from '../services/lesson.service';
import { DATA_DIR } from '../utils/data';

@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessons: LessonService,
    private readonly lessonAudio: LessonAudioService,
  ) {}
  @Get()
  list(@Res() res: Response, @Query('query') query?: string, @Query('level') level?: string, @Query('tags') tags?: string, @Query('includeDraft') includeDraft?: string) {
    res.setHeader('Cache-Control', 'no-store');
    const load = async () => {
      let data = await this.lessons.listLessons();
      const q = (query || '').trim().toLowerCase();
      const lv = (level || '').trim().toLowerCase();
      const tagSet = new Set((tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean));
      const showDraft = (includeDraft || '').toLowerCase() === 'true';
      if (!showDraft) data = data.filter((x: any) => !!x.published);
      if (q) data = data.filter((x: any) => String(x.title || '').toLowerCase().includes(q));
      if (lv) data = data.filter((x: any) => String(x.level || '').toLowerCase() === lv);
      if (tagSet.size > 0) data = data.filter((x: any) => Array.isArray(x.tags) && x.tags.some((t: string) => tagSet.has(String(t).toLowerCase())));
      return res.json({ code: 200, message: 'ok', data });
    };
    // 调用异步流程
    (async ()=>{ try { await load(); } catch { res.status(500).json({ code:500, message:'error', data:{ error:'list failed' }}); } })();
    return;
  }

  @Get(':id')
  meta(@Param('id') id: string, @Res() res: Response) {
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
  transcript(@Param('id') id: string, @Res() res: Response) {
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
  aggregate(@Param('id') id: string, @Res() res: Response, @Query('include') include?: string) {
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
