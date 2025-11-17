import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../utils/data';
import { gradeEssayLLM, type TutorFeedback } from '../utils/llm';
import { PrismaService } from '../services/prisma.service';
import { AuthService } from '../services/auth.service';
import { PracticeService } from '../services/practice.service';
import { ProgressService } from '../services/progress.service';
import { AppSettingService } from '../services/app-setting.service';

function readJSON<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

@Controller()
export class PracticeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly practiceService: PracticeService,
    private readonly appSettings: AppSettingService,
    private readonly progressService: ProgressService,
  ) {}

  private async resolveScoringConfig(): Promise<ScoringConfig> {
    try {
      const fromDb = await this.appSettings.get<any>('model-config', null);
      if (fromDb?.scoring) {
        return fromDb.scoring as ScoringConfig;
      }
    } catch {}
    return (await loadLegacyScoring()) || null;
  }

  @Get('practice/lessons/:lessonId')
  async getPackage(@Req() req: Request, @Param('lessonId') lessonId: string) {
    let userId: string | null = null;
    try {
      const user = await this.auth.attachUserToRequest(req);
      userId = user?.id || null;
    } catch {
      userId = null;
    }
    const practice = await this.prisma.practice.findUnique({ where: { lesson_id: lessonId } });
    if (!practice) {
      return { code: 404, message: 'error', data: { error: 'practice not found' } };
    }
    const clozeRaw = practice.cloze as any;
    const essayRaw = practice.essay as any;
    const safeCloze = clozeRaw
      ? {
          passage: clozeRaw.passage,
          items: (clozeRaw.items || []).map((it: any) => ({ index: it.index, options: it.options })),
        }
      : null;
    const safeEssay = essayRaw
      ? {
          prompt: essayRaw.prompt,
          min_words: essayRaw.min_words,
          max_words: essayRaw.max_words,
          rubric: essayRaw.rubric || { spelling: 1, grammar: 1, clarity: 1 },
        }
      : null;
    if (!safeCloze && !safeEssay) {
      return { code: 404, message: 'error', data: { error: 'practice not found' } };
    }
    let latest: any = null;
    if (userId) {
      const state = await this.practiceService.getLatestState(userId, lessonId);
      latest = serializeLatestState(state);
    }
    return { code: 200, message: 'ok', data: { cloze: safeCloze, essay: safeEssay, latest } };
  }

  @Post('practice/:lessonId/cloze/submit')
  async submitCloze(@Req() req: Request, @Param('lessonId') lessonId: string, @Body() body: any) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };

    const practice = await this.prisma.practice.findUnique({ where: { lesson_id: lessonId } });
    const cloze = practice?.cloze as any;
    if (!cloze) return { code: 404, message: 'error', data: { error: 'cloze not found' } };

    const answers = body?.answers || [];
    const byIndex = new Map<number, string>();
    answers.forEach((a: any) => byIndex.set(Number(a.index), String(a.value)));
    type ClozeResult = { index: number; correct: boolean; answer: any; analysis: string };
    const perItem: ClozeResult[] = (cloze.items || []).slice(0, 5).map((it: any) => {
      const userAnswer = byIndex.get(Number(it.index));
      const correct = typeof userAnswer === 'string' && userAnswer.trim().toLowerCase() === String(it.answer).trim().toLowerCase();
      return { index: it.index, correct, answer: it.answer, analysis: it.analysis || '' };
    });
    const correctCount = perItem.filter((item) => item.correct).length;
    const score = Math.round((correctCount / Math.max(perItem.length, 1)) * 100);
    const normalizedAnswers = Array.from(byIndex.entries()).map(([idx, value]) => ({ index: idx, value }));
    await this.practiceService.saveClozeAttempt(user.id, lessonId, { score, answers: normalizedAnswers, perItem });
    const increment = perItem.length > 0 && correctCount === perItem.length ? 2 : 1;
    await this.progressService.markProgress({
      userId: user.id,
      lessonId,
      mode: 'score',
      value: increment,
    });
    return {
      code: 200,
      message: 'ok',
      data: {
        score,
        perItem,
        answers: normalizedAnswers,
        submitted_at: new Date().toISOString(),
      },
    };
  }

  @Post('practice/:lessonId/essay/submit')
  async submitEssay(@Req() req: Request, @Param('lessonId') lessonId: string, @Body() body: any) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };

    const practice = await this.prisma.practice.findUnique({ where: { lesson_id: lessonId } });
    const essay = practice?.essay as any;
    if (!essay) return { code: 404, message: 'error', data: { error: 'essay not found' } };

    const content = String(body?.content || '');
    const minW = Number(essay.min_words || 30);
    const maxW = Number(essay.max_words || 200);
    const words = content.trim().split(/\s+/).filter(Boolean);
    if (words.length < minW || words.length > maxW) {
      return { code: 400, message: 'error', data: { error: `word count must be between ${minW}-${maxW}` } };
    }

    const scoringCfg = await this.resolveScoringConfig();
    const legacyLlm = readJSON<any>(path.join(DATA_DIR, 'config', 'llm.json'), null);
    const cfg = scoringCfg
      ? { enabled: !!scoringCfg.enabled, provider: scoringCfg.provider, providers: scoringCfg.providers || {} }
      : legacyLlm || { enabled: false, provider: 'openai', providers: {} };

    let feedback: TutorFeedback | null = null;
    let provider = 'fallback';
    let model = '';
    let latency_ms = 0;
    let lastError: Error | null = null;
    if (cfg.enabled) {
      try {
        const res = await gradeEssayLLM({ content, cfg, level: body?.level, focus: body?.focus, profile: body?.profile });
        if (res?.ok && res.feedback) {
          feedback = res.feedback;
          provider = res.provider;
          model = res.model || '';
          latency_ms = res.latency_ms || 0;
          if (!isFeedbackMeaningful(feedback)) feedback = null;
        } else if (res && !res.ok) {
          lastError = new Error('llm_failed');
        }
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'llm_error');
      }
    }
    if (!feedback) {
      const fallback = gradeEssay(content);
      feedback = fallback;
      provider = lastError ? `fallback(${lastError.message || 'error'})` : 'fallback';
    }

    const saved = await this.practiceService.saveEssayAttempt(user.id, lessonId, {
      content,
      feedback,
      provider,
      model,
      latency_ms,
    });
    await this.progressService.markProgress({
      userId: user.id,
      lessonId,
      mode: 'score',
      value: 2,
    });

    return {
      code: 200,
      message: 'ok',
      data: {
        feedback,
        content,
        provider,
        model,
        latency_ms,
        submitted_at: saved.created_at instanceof Date ? saved.created_at.toISOString() : new Date().toISOString(),
      },
    };
  }

  @Get('practice/:lessonId/state')
  async getLatest(@Req() req: Request, @Param('lessonId') lessonId: string) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const state = await this.practiceService.getLatestState(user.id, lessonId);
    return { code: 200, message: 'ok', data: serializeLatestState(state) };
  }

  @Delete('practice/:lessonId/state')
  async clearState(@Req() req: Request, @Param('lessonId') lessonId: string) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    await this.practiceService.clearAttempts(user.id, lessonId);
    return { code: 200, message: 'ok', data: { cleared: true } };
  }

  @Get('practice/:lessonId/attempts')
  async listAttempts(@Req() req: Request, @Param('lessonId') lessonId: string) {
    const user = await this.auth.attachUserToRequest(req);
    if (!user) return { code: 401, message: 'error', data: { error: 'unauthorized' } };
    const attempts = await this.practiceService.listAttempts(user.id, lessonId);
    return { code: 200, message: 'ok', data: { attempts } };
  }
}

function isFeedbackMeaningful(feedback: TutorFeedback | null) {
  if (!feedback) return false;
  return [feedback.summary, feedback.issues, feedback.rewrite].some(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
}

function gradeEssay(content: string): TutorFeedback {
  const clean = content.replace(/\s+/g, ' ').trim();
  const words = clean ? clean.split(/\s+/).filter(Boolean) : [];
  const wc = words.length;
  const sentences = clean ? clean.split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 25);
  const repeatedI = (clean.match(/\bI\b/g) || []).length;
  const lower = clean.toLowerCase();

  const greetingMatch = clean.match(/^(dear|hello|hi)\s+[a-z ]+/i);
  const hasGreeting = Boolean(greetingMatch);
  const hasPolite = /(please|thank|appreciate|would like|could i|may i|thanks)/i.test(lower);
  const hasClosing = /(thank you|thanks|best regards|regards|sincerely|yours truly|yours sincerely|kind regards)/i.test(lower);
  const symptomKeywords = ['cold', 'flu', 'fever', 'cough', 'headache', 'stomachache', 'sore throat', 'unwell', 'sick'];
  const symptomFound = symptomKeywords.find((k) => lower.includes(k));
  const planMatch = lower.match(/hospital|doctor|clinic|check-?up/);
  const returnMatch = lower.match(/tomorrow|next (?:week|monday|tuesday|wednesday|thursday|friday)|on (?:monday|tuesday|wednesday|thursday|friday)|this (?:afternoon|evening|morning)|as soon as i recover/);
  const restMatch = clean.match(/(one|two|three|four|five|six|seven|\d+)\s+day(?:s)?(?:\s+off)?/i);

  const summaryNextSteps: string[] = [];
  if (!returnMatch) summaryNextSteps.push('说明预计返校的时间或条件。');
  if (!hasClosing) summaryNextSteps.push('结尾加入感谢或敬语，让邮件更完整。');
  if (!planMatch) summaryNextSteps.push('补充你会采取的措施，例如看医生或休息安排。');
  if (longSentences.length > 0) summaryNextSteps.push('将较长的句子拆分为更短的句子，提升易读性。');
  if (summaryNextSteps.length === 0) summaryNextSteps.push('可以再补充一两句细节，例如家长是否知情或联系方式。');

  const summary = {
    overall:
      symptomFound || planMatch
        ? '整体表达清晰，已经把请假的原因和安排说明得很明确，老师能快速理解你的状况。'
        : '整体语气友好，能够表达请假诉求，再补充一点症状细节会更完整。',
    tone: hasPolite
      ? '语气礼貌自然，保持这样的亲切语气非常好。'
      : '语气诚恳但可再加入 “I would like to request…” 等礼貌句式，会更贴合邮件场景。',
    next_steps: summaryNextSteps,
  };

  type IssueItem = {
    type: string;
    original: string;
    explanation?: string;
    suggestion?: string;
    example?: string;
    confidence?: number;
  };
  const issues: IssueItem[] = [];
  if (!hasGreeting) {
    // 视为礼貌提醒，不计入待修正错误
  }
  if (!hasClosing) {
    // 视为礼貌提醒，不计入待修正错误
  }
  if (!returnMatch) {
    issues.push({
      type: 'logic',
      original: '未说明返校时间',
      explanation: '老师需要了解你大概何时能回到学校。',
      suggestion: '补充一句说明预计返校的日期或条件。',
      example: 'I plan to return to school tomorrow if my fever goes down.',
      confidence: 0.65,
    });
  }
  if (!symptomFound) {
    issues.push({
      type: 'vocabulary',
      original: '症状描述较少',
      explanation: '可以增加一两处具体症状，让老师更了解情况。',
      suggestion: '描述主要症状，例如 “I have a sore throat and a fever.”',
      example: 'I have been coughing and feel very tired.',
      confidence: 0.6,
    });
  }
  if (longSentences.length > 0) {
    issues.push({
      type: 'grammar',
      original: longSentences[0],
      explanation: '句子稍长且结构较复杂，容易造成理解困难。',
      suggestion: '尝试拆分为两句或使用连接词明确主从关系。',
      example: 'I will visit the doctor today. After the check-up I will rest at home.',
      confidence: 0.65,
    });
  }
  if (repeatedI > wc * 0.25) {
    issues.push({
      type: 'style',
      original: '频繁使用 “I” 开头',
      explanation: '第一人称反复出现，语气稍显单调。',
      suggestion: '尝试使用从句或被动语态，让句式更丰富。',
      example: 'This morning I woke up with a fever, so staying home will help me recover.',
      confidence: 0.55,
    });
  }

  const teacherLabel = greetingMatch ? greetingMatch[0].replace(/[\,\s]+$/, '') : 'Hello teacher';
  const symptomPhrase = symptomFound ? ` with ${symptomFound}` : ' and I am not feeling well';
  const planSentence = planMatch ? 'I plan to visit the hospital for a check-up.' : 'I will rest at home and monitor my condition.';
  const restSentence = restMatch ? `Could I take ${restMatch[0].replace(/\s+off/i, '')} to rest and recover?` : 'Could I take the day off to rest and recover?';
  let returnPhrase = 'as soon as I feel better';
  if (returnMatch) {
    const raw = returnMatch[0];
    if (/^on\s+/i.test(raw) || /^next\s+/i.test(raw) || /^tomorrow$/i.test(raw) || /^this\s+/i.test(raw)) {
      returnPhrase = raw;
    } else {
      returnPhrase = `on ${raw}`;
    }
  }
  const returnSentence = `I expect to return ${returnPhrase}.`;

  const rewriteText = `${teacherLabel}, I am writing to let you know that I am feeling unwell${symptomPhrase}. ${planSentence} ${restSentence} ${returnSentence} Thank you for your understanding.`
    .replace(/\s+/g, ' ')
    .trim();

  const allowed = new Set<string>(['grammar', 'logic', 'vocabulary', 'spelling']);
  const filteredIssues = issues.filter((it) => allowed.has(it.type));
  const issuesText = filteredIssues
    .map((it) => {
      const lines = [it.original];
      if (it.explanation) lines.push(it.explanation);
      if (it.suggestion) lines.push(`建议：${it.suggestion}`);
      if (it.example) lines.push(`示例：${it.example}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const issuesOutput = issuesText || '目前没有发现需要特别修改的语法或逻辑问题，继续保持这样的表达方式，非常棒！';

  const summaryLines = [summary.overall];
  if (summary.tone) summaryLines.push(`语气建议：${summary.tone}`);
  if (summary.next_steps.length > 0) {
    summaryLines.push('改进建议:');
    summary.next_steps.forEach((s) => summaryLines.push(`- ${s}`));
  }

  return {
    summary: summaryLines.join('\n'),
    issues: issuesOutput,
    rewrite: rewriteText,
  };
}

function serializeLatestState(state: { cloze: any; essay: any }) {
  const cloze = state.cloze
    ? {
        score: state.cloze.cloze_score ?? state.cloze.feedback?.score ?? null,
        answers: Array.isArray(state.cloze.feedback?.answers) ? state.cloze.feedback.answers : [],
        perItem: Array.isArray(state.cloze.feedback?.perItem) ? state.cloze.feedback.perItem : [],
        submitted_at:
          state.cloze.created_at instanceof Date
            ? state.cloze.created_at.toISOString()
            : state.cloze.created_at || null,
      }
    : null;
  const essay = state.essay
    ? {
        content: state.essay.essay_text || '',
        feedback: state.essay.feedback || null,
        provider: state.essay.provider || null,
        model: state.essay.model || null,
        latency_ms: state.essay.latency_ms ?? null,
        submitted_at:
          state.essay.created_at instanceof Date
            ? state.essay.created_at.toISOString()
            : state.essay.created_at || null,
      }
    : null;
  return { cloze, essay };
}

type ScoringConfig = {
  enabled: boolean;
  provider: string;
  providers: Record<string, any>;
} | null;

async function loadLegacyScoring(): Promise<ScoringConfig> {
  return null;
}
