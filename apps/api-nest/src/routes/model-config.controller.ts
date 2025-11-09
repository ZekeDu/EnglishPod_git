import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../utils/data';
import { getUserFromRequest } from '../utils/auth';
import { AppSettingService } from '../services/app-setting.service';

function readJSON<T>(p: string, fb: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return fb;
  }
}

type ModelsConfig = {
  tts: {
    enabled: boolean;
    provider: 'aliyun' | 'azure' | 'local';
    providers: {
      aliyun?: { accessKeyId?: string; accessKeySecret?: string; appKey?: string; region?: string; voice?: string; sampleRate?: number };
      azure?: { key?: string; region?: string; voice?: string };
      local?: { base?: string; voice?: string };
    };
  };
  scoring: {
    enabled: boolean;
    provider: 'openai' | 'gemini' | 'ollama' | 'deepseek';
    providers: {
      openai?: { base?: string; apiKey?: string; model?: string; timeout?: number; maxTokens?: number; temperature?: number };
      gemini?: { apiKey?: string; model?: string; timeout?: number };
      ollama?: { base?: string; model?: string; timeout?: number };
      deepseek?: { base?: string; apiKey?: string; model?: string; timeout?: number };
    };
  };
};

const DEFAULT_CFG: ModelsConfig = {
  tts: {
    enabled: false,
    provider: 'local',
    providers: { local: { base: '', voice: '' }, aliyun: { region: 'cn-shanghai', voice: 'xiaoyun', sampleRate: 16000 } },
  },
  scoring: {
    enabled: false,
    provider: 'ollama',
    providers: { ollama: { base: 'http://localhost:11434', model: 'llama3:instruct', timeout: 8000 } },
  },
};

@Controller('admin')
export class ModelConfigController {
  private readonly CONFIG_KEY = 'model-config';

  constructor(private readonly settings: AppSettingService) {}

  private isAdmin(req: Request) {
    const u = getUserFromRequest(req);
    return !!u && u.role === 'admin';
  }

  private async loadConfig(): Promise<ModelsConfig> {
    const fromDb = await this.settings.get<ModelsConfig | null>(this.CONFIG_KEY, null);
    if (fromDb) return fromDb;
    const fallback = readJSON<ModelsConfig>(path.join(DATA_DIR, 'config', 'models.json'), DEFAULT_CFG);
    await this.settings.set(this.CONFIG_KEY, fallback);
    return fallback;
  }

  private async saveConfig(cfg: ModelsConfig) {
    await this.settings.set(this.CONFIG_KEY, cfg);
  }

  private maskSensitive(cfg: ModelsConfig) {
    const safe = JSON.parse(JSON.stringify(cfg));
    if (safe.tts.providers.aliyun) {
      if ((safe.tts.providers.aliyun as any).accessKeySecret) {
        (safe.tts.providers.aliyun as any).accessKeySecret = '***';
      }
    }
    if (safe.tts.providers.azure) {
      if ((safe.tts.providers.azure as any).key) {
        (safe.tts.providers.azure as any).key = '***';
      }
    }
    if (safe.scoring.providers.openai) {
      if ((safe.scoring.providers.openai as any).apiKey) {
        (safe.scoring.providers.openai as any).apiKey = '***';
      }
    }
    if (safe.scoring.providers.deepseek) {
      if ((safe.scoring.providers.deepseek as any).apiKey) {
        (safe.scoring.providers.deepseek as any).apiKey = '***';
      }
    }
    if (safe.scoring.providers.gemini) {
      if ((safe.scoring.providers.gemini as any).apiKey) {
        (safe.scoring.providers.gemini as any).apiKey = '***';
      }
    }
    return safe;
  }

  @Get('model-services')
  async get(@Req() req: Request) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    return { code: 200, message: 'ok', data: this.maskSensitive(cfg) };
  }

  @Post('model-services')
  async set(@Req() req: Request, @Body() body: ModelsConfig) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cur = await this.loadConfig();
    const next = { ...cur, ...body } as ModelsConfig;
    await this.saveConfig(next);
    return { code: 200, message: 'ok', data: { saved: true } };
  }

  @Get('model-services/tts')
  async getTTS(@Req() req: Request) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    const tts = this.maskSensitive({ ...cfg, scoring: cfg.scoring }).tts;
    return { code: 200, message: 'ok', data: tts };
  }

  @Post('model-services/tts')
  async setTTS(@Req() req: Request, @Body() body: ModelsConfig['tts']) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cur = await this.loadConfig();
    const next: ModelsConfig = { ...cur, tts: { ...(cur.tts || DEFAULT_CFG.tts), ...(body || {}) } };
    await this.saveConfig(next);
    return { code: 200, message: 'ok', data: { saved: true } };
  }

  @Get('model-services/scoring')
  async getScoring(@Req() req: Request) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    const scoring = this.maskSensitive({ ...cfg, tts: cfg.tts }).scoring;
    return { code: 200, message: 'ok', data: scoring };
  }

  @Post('model-services/scoring')
  async setScoring(@Req() req: Request, @Body() body: ModelsConfig['scoring']) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cur = await this.loadConfig();
    const next: ModelsConfig = { ...cur, scoring: { ...(cur.scoring || DEFAULT_CFG.scoring), ...(body || {}) } };
    await this.saveConfig(next);
    return { code: 200, message: 'ok', data: { saved: true } };
  }

  @Post('model-services/health')
  async health(@Req() req: Request, @Body() body: { kind: string; provider: string; config?: any }) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    const kind = (body?.kind || '').toLowerCase();
    const provider = (body?.provider || '').toLowerCase();
    const src = body?.config || (kind === 'tts' ? (cfg.tts.providers as any)[provider] : (cfg.scoring.providers as any)[provider]);
    if (!src) return { code: 404, message: 'error', data: { ok: false, error: 'provider config missing' } };
    const required: Record<string, string[]> = {
      tts: provider === 'azure' ? ['region', 'key'] : provider === 'aliyun' ? ['accessKeyId', 'accessKeySecret', 'appKey', 'region'] : [],
      scoring: provider === 'openai' ? ['apiKey'] : provider === 'gemini' ? ['apiKey'] : provider === 'deepseek' ? ['apiKey'] : [],
    };
    const missing = (required[kind] || []).filter((key) => !src[key]);
    if (missing.length) return { code: 400, message: 'error', data: { ok: false, kind, provider, missing } };

    if (kind === 'scoring' || kind === 'tts') {
      const timeout = Number(src.timeout || 5000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const started = Date.now();
      const ok = (extra: any = {}) => ({ code: 200, message: 'ok', data: { ok: true, kind, provider, latency_ms: Date.now() - started, ...extra } });
      const fail = (error: any) => ({ code: 502, message: 'error', data: { ok: false, kind, provider, error: String(error || 'health check failed') } });
      try {
        if (kind === 'scoring' && provider === 'ollama') {
          const base = src.base || 'http://localhost:11434';
          const r = await fetch(`${base}/api/tags`, { signal: controller.signal } as any);
          clearTimeout(timer);
          if (!r.ok) return fail(`HTTP ${r.status}`);
          const j: any = await r.json();
          const names: string[] = Array.isArray(j?.models) ? j.models.map((m: any) => m.name) : [];
          const model = src.model || '';
          if (model && !names.some((n) => String(n).split(':')[0] === String(model).split(':')[0])) {
            return fail(`model_not_installed: ${model}`);
          }
          return ok({ models: names });
        }
        if (kind === 'scoring' && (provider === 'openai' || provider === 'deepseek')) {
          const base = provider === 'openai' ? src.base || 'https://api.openai.com/v1' : src.base || 'https://api.deepseek.com';
          const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${src.apiKey || ''}` }, signal: controller.signal } as any);
          clearTimeout(timer);
          if (!r.ok) return fail(`HTTP ${r.status}`);
          return ok();
        }
        if (kind === 'scoring' && provider === 'gemini') {
          const base = src.base || 'https://generativelanguage.googleapis.com';
          const keyq = `key=${encodeURIComponent(src.apiKey || '')}`;
          const r = await fetch(`${base}/v1beta/models?${keyq}`, { signal: controller.signal } as any);
          clearTimeout(timer);
          if (!r.ok) return fail(`HTTP ${r.status}`);
          return ok();
        }
        if (kind === 'tts' && provider === 'azure') {
          const base = `https://${src.region}.tts.speech.microsoft.com`;
          const r = await fetch(`${base}/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': src.key }, signal: controller.signal } as any);
          clearTimeout(timer);
          if (!r.ok) return fail(`HTTP ${r.status}`);
          const j: any = await r.json();
          return ok({ voices: Array.isArray(j) ? j.length : 0 });
        }
        if (kind === 'tts' && provider === 'local') {
          const base = src.base || '';
          if (!base) {
            clearTimeout(timer);
            return ok({ note: 'no-base, local placeholder' });
          }
          const r = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: controller.signal } as any);
          clearTimeout(timer);
          if (!r.ok) return fail(`HTTP ${r.status}`);
          return ok();
        }
        if (kind === 'tts' && provider === 'aliyun') {
          clearTimeout(timer);
          return ok({ simulated: true });
        }
      } catch (e: any) {
        clearTimeout(timer);
        return { code: 502, message: 'error', data: { ok: false, kind, provider, error: e?.message || String(e) } };
      }
    }
    return { code: 200, message: 'ok', data: { ok: true, kind, provider, simulated: true } };
  }

  @Get('model-services/ollama/models')
  async listOllamaModels(@Req() req: Request) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    const base = (req.query.base as string) || (cfg.scoring.providers as any)?.ollama?.base || 'http://localhost:11434';
    try {
      const r = await fetch(`${base}/api/tags`);
      if (!r.ok) return { code: 502, message: 'error', data: { error: `HTTP ${r.status}`, base } };
      const j: any = await r.json();
      const names: string[] = Array.isArray(j?.models) ? j.models.map((m: any) => m.name) : [];
      return { code: 200, message: 'ok', data: { base, models: names } };
    } catch (e: any) {
      return { code: 502, message: 'error', data: { error: e?.message || 'fetch failed', base } };
    }
  }

  @Get('model-services/tts/voices')
  async listAzureVoices(@Req() req: Request) {
    if (!this.isAdmin(req)) return { code: 403, message: 'error', data: { error: 'forbidden' } };
    const cfg = await this.loadConfig();
    const region = (req.query.region as string) || (cfg.tts.providers as any)?.azure?.region;
    const key = (req.query.key as string) || (cfg.tts.providers as any)?.azure?.key;
    if (!region || !key) return { code: 400, message: 'error', data: { error: 'region/key required' } };
    const base = `https://${region}.tts.speech.microsoft.com`;
    try {
      const r = await fetch(`${base}/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': key } });
      if (!r.ok) return { code: 502, message: 'error', data: { error: `HTTP ${r.status}` } };
      const j: any = await r.json();
      const voices = Array.isArray(j) ? j.map((v: any) => ({ shortName: v.ShortName || v.shortName || v.Name || v.name, locale: v.Locale || v.locale })) : [];
      return { code: 200, message: 'ok', data: { voices } };
    } catch (e: any) {
      return { code: 502, message: 'error', data: { error: e?.message || 'fetch failed' } };
    }
  }
}
