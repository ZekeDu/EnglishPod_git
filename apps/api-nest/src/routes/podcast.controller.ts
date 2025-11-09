import { Controller, Get, Param } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../utils/data';
import { LessonAudioService } from '../services/lesson-audio.service';
import { LessonService } from '../services/lesson.service';

@Controller('lessons/:id/podcast')
export class PodcastController {
  constructor(
    private readonly lessonAudio: LessonAudioService,
    private readonly lessonService: LessonService,
  ) {}

  @Get('meta')
  async meta(@Param('id') id: string) {
    let meta = (await this.lessonService.getPodcast(id))?.meta ?? null;
    if (!meta) {
      const filePath = path.join(DATA_DIR, 'lessons', id, 'podcast_meta.json');
      try {
        meta = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        meta = null;
      }
    }
    if (!meta) {
      return { code: 404, message: 'error', data: { error: 'meta not found' } };
    }
    try {
      const a = await this.lessonAudio.getAudio(id, 'podcast');
      if (a?.url) {
        const metaObj = meta as any;
        if (metaObj) {
          metaObj.audio_url = a.url.startsWith('local:uploads/') ? `/media/lesson/${id}/podcast` : a.url;
          if (a.duration != null) metaObj.duration = a.duration;
        }
      }
    } catch {}
    return { code: 200, message: 'ok', data: meta };
  }

  @Get('transcript')
  async transcript(@Param('id') id: string) {
    const fromDb = await this.lessonService.getPodcast(id);
    let transcript = fromDb?.transcript ?? null;
    if (!transcript) {
      const p = path.join(DATA_DIR, 'lessons', id, 'podcast_transcript.json');
      try {
        transcript = JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {
        transcript = null;
      }
    }
    if (!transcript) {
      return { code: 404, message: 'error', data: { error: 'transcript not found' } };
    }
    return { code: 200, message: 'ok', data: transcript };
  }
}
