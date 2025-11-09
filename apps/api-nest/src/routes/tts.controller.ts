import { Controller, Get, Query, Res, Param } from '@nestjs/common';
import * as fs from 'fs';
import type { Response } from 'express';
import { ensureTTSFile, getTTSAudioPath } from '../utils/tts';

@Controller('tts')
export class TTSController {
  @Get()
  async gen(@Query('text') text = '', @Query('lang') lang = 'en', @Query('voice') voice = '', @Query('rate') rate = '1.0') {
    const result = await ensureTTSFile(text, { lang, voice, rate });
    return {
      code: 200,
      message: 'ok',
      data: {
        url: `/tts/file/${result.key}`,
        cached: result.cached,
        provider: result.provider,
        fallback: result.fallback,
        error: result.error,
      },
    };
  }

  @Get('file/:name')
  file(@Param('name') name: string, @Res() res: Response) {
    const p = getTTSAudioPath(name);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('Content-Type', 'audio/wav');
    fs.createReadStream(p).pipe(res);
  }
}
