import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { ProgressService } from '../services/progress.service';

@Controller()
export class ProgressController {
  constructor(
    private readonly auth: AuthService,
    private readonly progress: ProgressService,
  ) {}

  @Post('progress/lesson/:id/mark')
  async mark(@Req() req: Request, @Param('id') id: string, @Query('mode') mode?: string, @Query('value') value?: string) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const normalizedMode = mode === 'score' ? 'score' : 'listen';
    const parsedValue = Number(value ?? 1);
    const result = await this.progress.markProgress({
      userId: user.id,
      lessonId: id,
      mode: normalizedMode,
      value: Number.isFinite(parsedValue) ? parsedValue : 1,
    });
    return { code: 200, message: 'ok', data: { completed: result.completed } };
  }

  @Get('me/progress/summary')
  async summary(@Req() req: Request) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const result = await this.progress.getSummary(user.id);
    return { code: 200, message: 'ok', data: result };
  }
}
