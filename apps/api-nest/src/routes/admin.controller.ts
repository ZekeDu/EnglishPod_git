import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../utils/data';
import { LessonService } from '../services/lesson.service';
import { Request, Response } from 'express';
import { ensureTTSFile } from '../utils/tts';
import { LessonAudioService } from '../services/lesson-audio.service';
import { AdminGuard } from '../guards/admin.guard';
import { AppSettingService } from '../services/app-setting.service';

function readJSON<T>(p: string, fb: T): T { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as T; } catch { return fb; } }
function writeJSON(p: string, obj: any) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

function snapshotLesson(dir: string, reason: string) {
  const meta = readJSON<any>(path.join(dir, 'meta.json'), null);
  const transcript = readJSON<any>(path.join(dir, 'transcript.json'), null);
  const vocab = readJSON<any>(path.join(dir, 'vocab.json'), null);
  const cloze = readJSON<any>(path.join(dir, 'practice', 'cloze.json'), null);
  const essay = readJSON<any>(path.join(dir, 'practice', 'essay.json'), null);
  const historyDir = path.join(dir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const version = (meta?.version ?? 0) as number;
  const payload = { ts, reason, version, meta, transcript, vocab, practice: { cloze, essay } };
  const file = path.join(historyDir, `${String(version).padStart(4, '0')}-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

// 简易时间戳质检：返回 warnings 与 errors
function qcTranscript(segments: any[]): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!Array.isArray(segments) || segments.length === 0) {
    errors.push('segments 为空或不是数组');
    return { warnings, errors };
  }
  let prevEnd = -Infinity;
  segments.forEach((s, i) => {
    const a = Number(s?.start_sec), b = Number(s?.end_sec);
    const text = String(s?.text_en || '').trim();
    if (!Number.isFinite(a) || !Number.isFinite(b)) errors.push(`第 ${i} 段：start_sec/end_sec 无效`);
    if (a >= b) errors.push(`第 ${i} 段：start>=end`);
    if (a < prevEnd) errors.push(`第 ${i} 段：与上一段重叠（${a.toFixed(2)} < ${prevEnd.toFixed(2)}）`);
    if (!text) errors.push(`第 ${i} 段：text_en 为空`);
    const dur = b - a;
    if (dur > 12) warnings.push(`第 ${i} 段：时长偏长（${dur.toFixed(2)}s）`);
    if (i > 0) {
      const gap = a - prevEnd;
      if (gap > 8) warnings.push(`第 ${i} 段：段间间隔较大（${gap.toFixed(2)}s）`);
    }
    prevEnd = Math.max(prevEnd, b);
  });
  return { warnings, errors };
}

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly lessons: LessonService,
    private readonly lessonAudio: LessonAudioService,
    private readonly settings: AppSettingService,
  ) {}

  @Get('lessons')
  async list(@Req() req: Request) {
    const url = new URL(req.url || '/', 'http://x');
    const query = (url.searchParams.get('query') || '').trim().toLowerCase();
    const level = (url.searchParams.get('level') || '').trim().toLowerCase();
    const tagsParam = (url.searchParams.get('tags') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const tags = new Set(tagsParam);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get('pageSize') || '20')));

    const all = await this.lessons.listLessons();
    let filtered = all;
    if (query) filtered = filtered.filter((x) => x.title.toLowerCase().includes(query));
    if (level) filtered = filtered.filter((x) => String(x.level || '').toLowerCase() === level);
    if (tags.size > 0) {
      filtered = filtered.filter((x) => {
        const tagList = Array.isArray(x.tags) ? x.tags : [];
        return tagList.some((t: any) => tags.has(String(t).toLowerCase()));
      });
    }
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    return { code: 200, message: 'ok', data, meta: { total, page, pageSize } };
  }

  // Provide a sample zip with lessons.json + audio placeholders
  @Get('import/sample.zip')
  async sampleZip(@Req() req: Request, @Res() res: Response) {
    // Dynamic import to avoid startup failure when dependency not installed
    let archiver: any;
    try { const m: any = await import('archiver'); archiver = m.default || m; } catch { return res.status(501).json({ code:501, message:'error', data:{ error:'archiver not installed' } }); }
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition','attachment; filename="sample-import.zip"');
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', () => { try { res.status(500).end(); } catch {} });
    archive.pipe(res);
    const lesson = {
      version: '1.1',
      lessons: [
        {
          id: '1',
          meta: { title: 'Lesson 1 Title', level: 'Elementary', tags: ['tag1','tag2'], audio: { file: '1_main.mp3' }, duration: 300, published: false },
          transcript: { segments: [ { idx:0, start_sec:0.50, end_sec:1.80, text_en:'Hello!' } ] },
          vocab: { cards: [ { word:'example', meaning:'示例' } ] },
          practice: { cloze: { passage: 'I {1} English.', items:[{ index:1, options:['like','likes'], answer:'like' }] }, essay: { prompt:'Write...', min_words:30, max_words:200 } },
          podcast: { meta: { }, audio: { file: '1_podcast.mp3' }, transcript: { dialogue: [ { idx:0, speaker:'M', text:'Hello' } ] } }
        }
      ]
    };
    archive.append(JSON.stringify(lesson, null, 2), { name: 'lessons.json' });
    archive.append(Buffer.from([]), { name: 'audio/1_main.mp3' });
    archive.append(Buffer.from([]), { name: 'audio/1_podcast.mp3' });
    archive.finalize();
  }

  @Get('lessons/:id')
  async get(@Param('id') id: string, @Req() req: Request) {
    const lesson = await this.lessons.getLessonFull(id);
    if (!lesson.meta) return { code: 404, message: 'error', data: { error: 'not found' } };
    const metaRaw: any = lesson.meta;
    const meta = {
      ...metaRaw,
      tags: Array.isArray(metaRaw?.tags) ? metaRaw.tags : [],
      published_at:
        metaRaw?.published_at instanceof Date
          ? metaRaw.published_at.toISOString()
          : metaRaw?.published_at || null,
      created_at:
        metaRaw?.created_at instanceof Date
          ? metaRaw.created_at.toISOString()
          : metaRaw?.created_at || null,
      updated_at:
        metaRaw?.updated_at instanceof Date
          ? metaRaw.updated_at.toISOString()
          : metaRaw?.updated_at || null,
    };
    const mainAudio = await this.lessonAudio.getAudio(id, 'main');
    if (meta && mainAudio?.url) {
      meta.audio_url = mainAudio.url.startsWith('local:uploads/') ? `/media/lesson/${id}/main` : mainAudio.url;
      if (mainAudio.duration != null) meta.duration = mainAudio.duration;
    }
    let podcast = lesson.podcast
      ? {
          meta: (lesson.podcast as any).meta ?? null,
          transcript: (lesson.podcast as any).transcript ?? null,
        }
      : null;
    if (!podcast || (!podcast.meta && !podcast.transcript)) {
      podcast = await this.lessons.getPodcast(id);
    }
    if (!podcast || (!podcast.meta && !podcast.transcript)) {
      try {
        const dir = path.join(DATA_DIR, 'lessons', id);
        const metaFile = readJSON<any>(path.join(dir, 'podcast_meta.json'), null);
        const transcriptFile = readJSON<any>(path.join(dir, 'podcast_transcript.json'), null);
        if (metaFile || transcriptFile) {
          podcast = { meta: metaFile, transcript: transcriptFile };
        }
      } catch {}
    }
    if (podcast && podcast.meta) {
      const podcastAudio = await this.lessonAudio.getAudio(id, 'podcast');
      if (podcastAudio?.url) {
        podcast.meta.audio_url = podcastAudio.url.startsWith('local:uploads/') ? `/media/lesson/${id}/podcast` : podcastAudio.url;
        if (podcastAudio.duration != null) podcast.meta.duration = podcastAudio.duration;
      }
    }
    if (!podcast) {
      podcast = { meta: null, transcript: null };
    }
    return {
      code: 200,
      message: 'ok',
      data: {
        meta,
        transcript: lesson.transcript,
        vocab: lesson.vocab,
        practice: lesson.practice,
        podcast,
      },
    };
  }

  @Get('lessons/:id/versions')
  async versions(@Param('id') id: string, @Req() req: Request) {
    const list = await this.lessons.listHistory(id);
    return { code: 200, message: 'ok', data: { versions: list } };
  }

  @Get('lessons/:id/qc')
  async qc(@Param('id') id: string, @Req() req: Request) {
    const t = await this.lessons.getLessonFull(id);
    if (!t?.transcript || !Array.isArray(t.transcript.segments)) {
      return { code: 404, message: 'error', data: { error: 'transcript not found' } };
    }
    const result = qcTranscript(t.transcript.segments);
    return { code: 200, message: 'ok', data: result };
  }

  @Put('lessons/:id/meta')
  async updateMeta(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const exists = await this.lessons.getLessonMeta(id);
    if (exists) {
      await this.lessons.createHistory(id, 'update_meta').catch(() => {});
    }
    const payload = {
      ...(exists || {}),
      ...body,
      id,
      lesson_no: Number(body?.lesson_no ?? body?.lessonNo ?? exists?.lesson_no ?? id),
      tags: Array.isArray(body?.tags) ? body.tags : exists?.tags || [],
    };
    const saved = await this.lessons.upsertLessonMeta(payload);
    return {
      code: 200,
      message: 'ok',
      data: {
        updated: true,
        meta: {
          ...saved,
          created_at: saved.created_at?.toISOString?.() || saved.created_at,
          updated_at: saved.updated_at?.toISOString?.() || saved.updated_at,
          published_at: saved.published_at?.toISOString?.() || saved.published_at,
        },
      },
    };
  }

  @Put('lessons/:id/transcript')
  async updateTranscript(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    if (!Array.isArray(body?.segments)) return { code: 400, message: 'error', data: { error: 'segments must be array' } };
    await this.lessons.createHistory(id, 'update_transcript').catch(() => {});
    const qc = qcTranscript(body.segments);
    await this.lessons.saveTranscript(id, { segments: body.segments });
    return { code: 200, message: 'ok', data: { updated: true, qc, hasErrors: qc.errors.length > 0 } };
  }

  @Put('lessons/:id/vocab')
  async updateVocab(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const cards = body?.cards;
    if (!Array.isArray(cards)) {
      return { code: 400, message: 'error', data: { error: 'cards must be array' } };
    }
    const errs: string[] = [];
    const normalized = cards.map((c: any, i: number) => {
      const phrase = (c.word || c.phrase || '').toString();
      const meaning = (c.meaning || '').toString() || (c.definition || '').toString();
      if (!phrase) errs.push(`cards[${i}].word required`);
      if (!meaning) errs.push(`cards[${i}].meaning required`);
      const { definition: _legacyDefinition, ...rest } = c || {};
      void _legacyDefinition;
      return {
        ...rest,
        id: String(c.id || `${id}-${i}`),
        phrase,
        meaning,
      };
    });
    if (errs.length) {
      return { code: 400, message: 'error', data: { error: 'invalid vocab', details: errs } };
    }
    await this.lessons.createHistory(id, 'update_vocab').catch(() => {});
    await this.lessons.saveVocab(id, { ...body, cards: normalized });
    return { code: 200, message: 'ok', data: { updated: true } };
  }

  @Put('lessons/:id/practice')
  async updatePractice(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    if (body?.cloze) {
      const c = body.cloze;
      if (typeof c.passage !== 'string' || !Array.isArray(c.items)) {
        return { code: 400, message: 'error', data: { error: 'invalid cloze' } };
      }
      c.items.forEach((it: any, i: number) => {
        if (typeof it.index !== 'number' || !Array.isArray(it.options)) {
          throw new Error(`cloze.items[${i}] invalid`);
        }
      });
    }
    if (body?.essay) {
      const e = body.essay;
      if (typeof e.prompt !== 'string') {
        return { code: 400, message: 'error', data: { error: 'invalid essay' } };
      }
    }
    await this.lessons.createHistory(id, 'update_practice').catch(() => {});
    await this.lessons.savePractice(id, {
      cloze: body?.cloze,
      essay: body?.essay,
    });
    return { code: 200, message: 'ok', data: { updated: true } };
  }

  // Update podcast meta/transcript
  @Put('lessons/:id/podcast')
  async updatePodcast(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const dir = path.join(DATA_DIR, 'lessons', id);
    snapshotLesson(dir, 'update_podcast');
    const payload = {
      meta: Object.prototype.hasOwnProperty.call(body || {}, 'meta') ? body.meta : undefined,
      transcript: Object.prototype.hasOwnProperty.call(body || {}, 'transcript') ? body.transcript : undefined,
    };
    await this.lessons.createHistory(id, 'update_podcast').catch(() => {});
    await this.lessons.savePodcast(id, payload);
    if (Object.prototype.hasOwnProperty.call(body || {}, 'meta')) {
      if (body.meta === null) {
        try { fs.unlinkSync(path.join(dir, 'podcast_meta.json')); } catch {}
      } else {
        writeJSON(path.join(dir, 'podcast_meta.json'), body.meta);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body || {}, 'transcript')) {
      if (body.transcript === null) {
        try { fs.unlinkSync(path.join(dir, 'podcast_transcript.json')); } catch {}
      } else {
        writeJSON(path.join(dir, 'podcast_transcript.json'), body.transcript);
      }
    }
    return { code: 200, message: 'ok', data: { updated: true } };
  }

  // Attach audio (main or podcast) after upload
  @Post('lessons/:id/audio/attach')
  async attachAudio(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    const { type, url, duration } = body || {};
    if (!url || !type) return { code: 400, message: 'error', data: { error: 'type and url required' } };
    if (type !== 'main' && type !== 'podcast') {
      return { code: 400, message: 'error', data: { error: 'unknown type' } };
    }
    const dir = path.join(DATA_DIR, 'lessons', id);
    snapshotLesson(dir, `attach_audio_${type}`);
    await this.lessonAudio.setAudio({ lessonId: id, kind: type, url: String(url), duration: duration != null ? Number(duration) : null });
    const exposedUrl = String(url).startsWith('local:uploads/') ? `/media/lesson/${id}/${type}` : String(url);
    return { code: 200, message: 'ok', data: { updated: true, kind: type, url: exposedUrl } };
  }

  @Put('lessons/:id/publish')
  async publish(@Param('id') id: string, @Req() req: Request) {
    const lesson = await this.lessons.getLessonFull(id);
    if (!lesson.meta) return { code: 404, message: 'error', data: { error: 'not found' } };
    if (lesson.transcript && Array.isArray(lesson.transcript.segments)) {
      const qc = qcTranscript(lesson.transcript.segments);
      if (qc.errors.length) {
        return { code: 400, message: 'error', data: { error: 'transcript has errors, cannot publish', details: qc } };
      }
    }
    await this.lessons.createHistory(id, 'publish').catch(() => {});
    const updated = await this.lessons.publishLesson(id, true);
    return {
      code: 200,
      message: 'ok',
      data: { published: true, version: updated.version },
    };
  }

  @Put('lessons/:id/unpublish')
  async unpublish(@Param('id') id: string, @Req() req: Request) {
    await this.lessons.createHistory(id, 'unpublish').catch(() => {});
    await this.lessons.publishLesson(id, false);
    return { code: 200, message: 'ok', data: { published: false } };
  }

  @Delete('lessons/:id')
  async removeLesson(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('purgeUploads') purgeUploads?: string,
  ) {
    const lesson = await this.lessons.getLessonFull(id);
    if (!lesson.meta) return { code: 404, message: 'error', data: { error: 'not found' } };

    const lessonDir = path.join(DATA_DIR, 'lessons', id);
    const audioRecords = await this.lessonAudio.listAudio(id).catch(() => []);
    let trashPath: string | null = null;
    if (fs.existsSync(lessonDir)) {
      try {
        snapshotLesson(lessonDir, 'delete');
      } catch {}
      const trashRoot = path.join(DATA_DIR, 'trash', 'lessons');
      const suffix = new Date().toISOString().replace(/[:.]/g, '-');
      const target = path.join(trashRoot, `${id}-${suffix}`);
      try {
        fs.mkdirSync(trashRoot, { recursive: true });
      } catch {}
      try {
        fs.renameSync(lessonDir, target);
        trashPath = target;
      } catch (_err) {
        try {
          // Fallback for cross-device move
          if (typeof (fs as any).cpSync === 'function') {
            (fs as any).cpSync(lessonDir, target, { recursive: true });
            fs.rmSync(lessonDir, { recursive: true, force: true });
            trashPath = target;
          }
        } catch {}
      }
    }

    try {
      await this.lessons.deleteLesson(id);
    } catch (err) {
      return {
        code: 500,
        message: 'error',
        data: { error: 'delete_failed', details: err instanceof Error ? err.message : String(err) },
      };
    }

    const shouldPurge = ['1', 'true', 'yes'].includes(String(purgeUploads || '').toLowerCase());
    const removedAudio: string[] = [];
    if (shouldPurge && Array.isArray(audioRecords) && audioRecords.length > 0) {
      const uploadsRoot = path.join(DATA_DIR, 'uploads');
      const rootResolved = path.resolve(uploadsRoot);
      for (const audio of audioRecords) {
        const url = typeof audio?.url === 'string' ? audio.url : '';
        if (!url.startsWith('local:uploads/')) continue;
        const rel = url.slice('local:uploads/'.length).replace(/^\/+/, '');
        const filePath = path.resolve(uploadsRoot, rel);
        if (!filePath.startsWith(rootResolved)) continue;
        try {
          fs.rmSync(filePath, { force: true });
          removedAudio.push(url);
        } catch {}
      }
    }

    return {
      code: 200,
      message: 'ok',
      data: {
        deleted: true,
        trashPath,
        audioRemoved: removedAudio,
        audioRetained: Array.isArray(audioRecords)
          ? audioRecords
              .map((a: any) => a?.url)
              .filter((u: any) => typeof u === 'string' && !removedAudio.includes(u))
          : [],
      },
    };
  }

  @Post('lessons/:id/rollback')
  async rollback(@Param('id') id: string, @Req() req: Request, @Body() body: any) {
    const key = String(body?.version || body?.history_id || body?.id || body?.file || '').trim();
    if (!key) return { code: 400, message: 'error', data: { error: 'history id required' } };
    await this.lessons.restoreFromHistory(id, key);
    await this.lessons.createHistory(id, 'rollback').catch(() => {});
    return { code: 200, message: 'ok', data: { rolledBack: true } };
  }

  // 批量预生成本课 TTS（词汇 + 字幕句子），固定音色/语速
  @Post('lessons/:id/tts/prefetch')
  async prefetchTTS(@Param('id') id: string, @Req() req: Request) {
    const vocab = await this.lessons.getLessonFull(id);
    const vocabCards = Array.isArray(vocab?.vocab?.cards) ? (vocab?.vocab?.cards as any[]) : [];
    const set = new Set<string>();
    vocabCards.forEach((c: any) => { const w = String(c.word || c.phrase || '').trim(); if (w) set.add(w); });
    // 逐句字幕已由原始录音覆盖，不再为字幕生成 TTS
    const dirCache = path.join(DATA_DIR, 'tts-cache');
    ensureDir(dirCache);
    let created = 0, skipped = 0, fallback = 0;
    const errors: { text: string; error: string }[] = [];
    const cfg = await this.settings.get<any>('model-config', null);
    for (const text of set) {
      try {
        const result = await ensureTTSFile(text, {}, cfg);
        if (result.cached) skipped++; else created++;
        if (result.fallback) {
          fallback++;
          if (result.error) errors.push({ text: text.slice(0, 80), error: result.error });
        }
      } catch (err: any) {
        fallback++;
        errors.push({ text: text.slice(0, 80), error: err?.message || String(err) });
      }
    }
    return { code: 200, message: 'ok', data: { total: set.size, created, skipped, fallback, errors: errors.slice(0, 10) } };
  }

  // Create a new lesson with empty templates
  @Post('lessons')
  async createLesson(@Body() body: any, @Req() req: Request) {
    try {
      const created = await this.lessons.createLesson({
        id: body?.id,
        lesson_no: body?.lesson_no,
        title: body?.title,
      });
      return { code: 200, message: 'ok', data: created };
    } catch (e: any) {
      if (String(e.message).includes('lesson_exists')) {
        return { code: 409, message: 'error', data: { error: 'exists' } };
      }
      return { code: 500, message: 'error', data: { error: e?.message || 'create failed' } };
    }
  }

  // Import a ZIP: lessons.json + audio/* files
  @Post('import/zip')
  async importZip(@Req() req: Request) {
    try {
      // Dynamic import to avoid hard dependency at startup
      let unzipper: any;
      try { const m: any = await import('unzipper'); unzipper = m.default || m; } catch { return { code:501, message:'error', data:{ error:'unzipper not installed' } }; }
      const urlObj = new URL(req.url || '/', 'http://x');
      const dryRun = urlObj.searchParams.get('dry_run') === '1';
      const publish = urlObj.searchParams.get('publish') === '1';
      const overwriteParam = (urlObj.searchParams.get('overwrite') || 'all').toLowerCase();
      const overwriteAll = overwriteParam === 'all';
      const overwriteSet = new Set(overwriteAll ? ['meta','transcript','vocab','practice','podcast'] : overwriteParam.split(',').map(s=>s.trim()).filter(Boolean));

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c) => chunks.push(Buffer.from(c)));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      const buf = Buffer.concat(chunks);
      const dirObj = await unzipper.Open.buffer(buf);
      const fileMap: Record<string, Buffer> = {};
      for (const f of dirObj.files) {
        if (f.type === 'File') {
          const b = await f.buffer();
          fileMap[f.path.replace(/\\/g,'/')] = b;
        }
      }
      const lessonEntry = Object.keys(fileMap).find(p=>/lessons\.json$/i.test(p));
      if (!lessonEntry) return { code: 400, message: 'error', data: { error: 'lessons.json missing' } };
      const j = JSON.parse(fileMap[lessonEntry].toString('utf-8'));
      const lessons: any[] = Array.isArray(j?.lessons) ? j.lessons : [];
      const report: any = { total: lessons.length, success: 0, failed: 0, timestampErrors: 0, timestampWarnings: 0, items: [] as any[] };
      const lessonsDir = path.join(DATA_DIR, 'lessons'); ensureDir(lessonsDir);
      const has = (part: string) => overwriteAll || overwriteSet.has(part);

      for (const item of lessons) {
        const id = String(item.id || item.lesson_no || '').trim();
        if (!/^\d+$/.test(id)) { report.failed++; report.items.push({ id, status:'failed', errors:['invalid id'] }); continue; }
        const dir = path.join(DATA_DIR, 'lessons', id); ensureDir(dir); ensureDir(path.join(dir,'practice'));
        const itemReport: any = { id };
        try {
          const metaIn = item.meta || {};
          const baseMeta = {
            id,
            lesson_no: Number(id),
            title: metaIn.title || `Lesson ${id}`,
            level: metaIn.level || '',
            tags: metaIn.tags || [],
            duration: Number(metaIn.duration || 0) || 0,
            published: !!metaIn.published,
          };
          const mainFile = metaIn.audio?.file || metaIn.audio_file;
          if (!dryRun && has('meta')) {
            let storedMainUrl: string | null = null;
            let exposedMainUrl = metaIn.audio?.url || metaIn.audio_url || '';
            if (mainFile && fileMap[`audio/${mainFile}`]) {
              const extRaw = path.extname(mainFile) || '.mp3';
              const ext = extRaw.startsWith('.') ? extRaw : `.${extRaw}`;
              const rel = path.join('lesson-import', id, `main${ext}`);
              const outPath = path.join(DATA_DIR, 'uploads', rel);
              ensureDir(path.dirname(outPath));
              fs.writeFileSync(outPath, fileMap[`audio/${mainFile}`]);
              storedMainUrl = `local:uploads/${rel}`;
              exposedMainUrl = `/media/lesson/${id}/main`;
            } else if (exposedMainUrl) {
              storedMainUrl = String(exposedMainUrl);
              if (!/^https?:\/\//i.test(storedMainUrl)) {
                exposedMainUrl = `/media/lesson/${id}/main`;
              }
            } else {
              exposedMainUrl = `/media/lesson/${id}/main`;
            }
            await this.lessons.upsertLessonMeta({ ...baseMeta, audio_url: exposedMainUrl });
            if (storedMainUrl) {
              await this.lessonAudio.setAudio({
                lessonId: id,
                kind: 'main',
                url: storedMainUrl,
                duration: Number(metaIn.duration || 0) || null,
              });
            }
          } else if (!dryRun && !has('meta')) {
            await this.lessons.upsertLessonMeta(baseMeta);
          }

          if (item.transcript && has('transcript')) {
            if (!Array.isArray(item.transcript?.segments)) throw new Error('transcript.segments must be array');
            const qc = qcTranscript(item.transcript.segments);
            itemReport.timestampQc = qc;
            report.timestampWarnings += qc.warnings.length;
            report.timestampErrors += qc.errors.length;
            if (!dryRun) {
              await this.lessons.saveTranscript(id, item.transcript);
            }
          }

          if (item.vocab && has('vocab')) {
            if (!dryRun) await this.lessons.saveVocab(id, item.vocab);
          }

          if (item.practice && has('practice')) {
            if (!dryRun) await this.lessons.savePractice(id, item.practice);
          }

          if (item.podcast && has('podcast')) {
            if (!dryRun) {
              const pm = { ...(item.podcast.meta || {}), audio_url: '' } as any;
              const audioInfo = (item.podcast && (item.podcast.audio || item.podcast.meta?.audio)) || {};
              const pfile = audioInfo.file || item.podcast.audio_file;
              const purl = audioInfo.url || item.podcast.audio_url;
              let storedPodcastUrl: string | null = null;
              if (pfile && fileMap[`audio/${pfile}`]) {
                const extRaw = path.extname(pfile) || '.mp3';
                const ext = extRaw.startsWith('.') ? extRaw : `.${extRaw}`;
                const rel = path.join('lesson-import', id, `podcast${ext}`);
                const outPath = path.join(DATA_DIR, 'uploads', rel);
                ensureDir(path.dirname(outPath));
                fs.writeFileSync(outPath, fileMap[`audio/${pfile}`]);
                storedPodcastUrl = `local:uploads/${rel}`;
                pm.audio_url = `/media/lesson/${id}/podcast`;
              } else if (purl) {
                storedPodcastUrl = String(purl);
                pm.audio_url = storedPodcastUrl.startsWith('http') ? storedPodcastUrl : `/media/lesson/${id}/podcast`;
              } else {
                pm.audio_url = `/media/lesson/${id}/podcast`;
              }
              if (storedPodcastUrl) {
                await this.lessonAudio.setAudio({
                  lessonId: id,
                  kind: 'podcast',
                  url: storedPodcastUrl,
                  duration: Number(item.podcast.meta?.duration || 0) || null,
                });
              }
              await this.lessons.savePodcast(id, {
                meta: pm,
                transcript: item.podcast.transcript || null,
              });
              writeJSON(path.join(dir, 'podcast_meta.json'), pm);
              if (item.podcast.transcript) {
                writeJSON(path.join(dir, 'podcast_transcript.json'), item.podcast.transcript);
              }
            }
          }

          if (!dryRun && publish && has('meta')) {
            await this.lessons.publishLesson(id, true);
          }

          const baseStatus = dryRun ? 'valid' : 'created_or_updated';
          const hasTimestampErrors = Array.isArray(itemReport.timestampQc?.errors) && itemReport.timestampQc.errors.length > 0;
          itemReport.status = hasTimestampErrors ? `${baseStatus}_with_timestamp_errors` : baseStatus;
          report.success++;
          report.items.push(itemReport);
        } catch (e:any) {
          report.failed++;
          itemReport.status = 'failed';
          itemReport.errors = [e?.message || 'error'];
          report.items.push(itemReport);
        }
      }
      return { code: 200, message: 'ok', data: report };
    } catch (e:any) {
      return { code: 500, message: 'error', data: { error: 'import failed' } };
    }
  }
}
