import { Controller, Get, Query, Res, Param } from '@nestjs/common';
import * as fs from 'fs';
import type { Response } from 'express';
import { ensureTTSFile, getTTSAudioPath } from '../utils/tts';
import { AppSettingService } from '../services/app-setting.service';

@Controller('tts')
export class TTSController {
  constructor(private readonly settings: AppSettingService) {}

  @Get()
  async gen(@Query('text') text = '', @Query('lang') lang = 'en', @Query('voice') voice = '', @Query('rate') rate = '1.0') {
    const modelsCfg = await this.settings.get<any>('model-config', null);
    const result = await ensureTTSFile(text, { lang, voice, rate }, modelsCfg);
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
