import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { LessonAudioService } from '../services/lesson-audio.service';
import { DATA_DIR } from '../utils/data';
import { AuthService } from '../services/auth.service';
import { FREE_LESSON_IDS } from './lessons.controller';
import { safeJoinPath } from '../utils/safe-path';

function streamLocal(req: Request, res: Response, relKey: string) {
  const baseUploads = path.join(DATA_DIR, 'uploads');
  let filePath: string;
  try {
    filePath = safeJoinPath(baseUploads, String(relKey || ''));
  } catch {
    res.status(400).end();
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = (
    {
      '.mp3': 'audio/mpeg',
      '.mpeg': 'audio/mpeg',
      '.mp4': 'audio/mp4',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.oga': 'audio/ogg',
    } as Record<string, string>
  )[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range));
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      return res.end();
    }
    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(chunkSize));
    res.setHeader('Content-Type', mime);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(size));
  res.setHeader('Content-Type', mime);
  fs.createReadStream(filePath).pipe(res);
}

@Controller('media/lesson/:id')
export class MediaController {
  constructor(private readonly audioService: LessonAudioService, private readonly auth: AuthService) {}

  private async handle(kind: 'main' | 'podcast', id: string, req: Request, res: Response) {
    try {
      await this.auth.attachUserToRequest(req);
    } catch {}
    const isAuthed = !!this.auth.getUserFromRequest(req);
    const normalizedId = String(id || '').padStart(3, '0');
    if (!isAuthed && !FREE_LESSON_IDS.has(normalizedId)) {
      return res.status(401).json({ code: 401, message: 'error', data: { error: 'login required' } });
    }
    const audio = await this.audioService.getAudio(id, kind);
    if (!audio?.url) {
      return res.status(404).json({ code: 404, message: 'error', data: { error: 'audio not found' } });
    }
    const target = String(audio.url);
    if (target.startsWith('local:uploads/')) {
      return streamLocal(req, res, target.replace(/^local:uploads\//, ''));
    }
    if (target.startsWith('/')) {
      // treat as relative path under uploads
      return streamLocal(req, res, target.replace(/^\//, ''));
    }
    res.redirect(target);
  }

  @Get('main')
  async main(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.handle('main', id, req, res);
  }

  @Get('podcast')
  async podcast(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.handle('podcast', id, req, res);
  }
}
