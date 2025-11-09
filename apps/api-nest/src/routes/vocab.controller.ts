import { Controller, Get, Param } from '@nestjs/common';
import { LessonService } from '../services/lesson.service';

@Controller('lessons')
export class VocabController {
  constructor(private readonly lessons: LessonService) {}
  @Get(':id/vocab')
  async list(@Param('id') id: string) {
    const vocab = await this.lessons.getVocabOnly(id);
    if (!vocab || !Array.isArray(vocab.cards)) {
      return { code: 404, message: 'error', data: { error: 'vocab not found' } };
    }
    const cards = vocab.cards.map((c: any, i: number) => ({ id: String(c?.id || `${id}-${i}`), ...c }));
    return { code: 200, message: 'ok', data: { cards } };
  }
}
