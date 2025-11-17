import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { DATA_DIR } from './data';
import { createHash, createHmac, randomUUID } from 'crypto';

type AliyunConfig = {
  accessKeyId?: string;
  accessKeySecret?: string;
  appKey?: string;
  region?: string;
  voice?: string;
  sampleRate?: number;
};

type AzureConfig = {
  key?: string;
  region?: string;
  voice?: string;
  format?: string;
};

type LocalConfig = {
  base?: string;
  voice?: string;
};

type ModelsConfig = {
  tts?: {
    enabled?: boolean;
    provider?: 'aliyun' | 'azure' | 'local';
    providers?: {
      aliyun?: AliyunConfig;
      azure?: AzureConfig;
      local?: LocalConfig;
    };
  };
};

const SILENT_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

const TOKEN_CACHE: Record<string, { token: string; expire: number }> = {};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function hashKey(parts: string[]) {
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

function writeFallbackWav(file: string) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, Buffer.from(SILENT_WAV_BASE64, 'base64'));
}

function appendErrorLog(message: string) {
  try {
    const logPath = path.join(DATA_DIR, 'tts-cache', 'tts-errors.log');
    ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore logging failure
  }
}

function requestBuffer(urlStr: string, options: { method?: string; headers?: Record<string, string>; body?: Buffer | null }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const client = urlObj.protocol === 'https:' ? https : http;
    const body = options.body || null;
    const req = client.request(
      {
        method: options.method || 'GET',
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: {
          ...(options.headers || {}),
          ...(body ? { 'Content-Length': String(body.length) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchAliyunToken(cfg: AliyunConfig): Promise<string> {
  const accessKeyId = cfg.accessKeyId || '';
  const accessKeySecret = cfg.accessKeySecret || '';
  if (!accessKeyId || !accessKeySecret) throw new Error('aliyun accessKeyId/accessKeySecret missing');
  const region = cfg.region || 'cn-shanghai';
  const cacheKey = `${accessKeyId}:${region}`;
  const cached = TOKEN_CACHE[cacheKey];
  if (cached && cached.expire > Date.now() + 60_000) return cached.token;

  let tokenResult: { token: string; expire: number } | null = null;
  const primaryEndpoint = `https://nls-meta.${region}.aliyuncs.com/api/v1/token`;
  try {
    const body = Buffer.from(JSON.stringify({ AccessKeyId: accessKeyId, AccessKeySecret: accessKeySecret }));
    const res = await requestBuffer(primaryEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status < 400) {
      const parsed = JSON.parse(res.body.toString('utf-8'));
      const token = parsed?.Token?.Id || parsed?.token || '';
      const exp = parsed?.Token?.ExpireTime || 0;
      if (!token) throw new Error('aliyun token missing');
      const expire = typeof exp === 'number' ? exp * 1000 : Date.now() + 5 * 60 * 1000;
      tokenResult = { token, expire };
    } else {
      throw new Error(`aliyun token http ${res.status}: ${res.body.toString('utf-8')}`);
    }
  } catch (err) {
    // fallback to RPC style token request when REST endpoint not available
    tokenResult = await fetchAliyunTokenRPC(accessKeyId, accessKeySecret, region);
    if (!tokenResult) throw err;
  }

  TOKEN_CACHE[cacheKey] = tokenResult;
  return tokenResult.token;
}

function percentEncode(str: string) {
  return encodeURIComponent(str)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

async function fetchAliyunTokenRPC(accessKeyId: string, accessKeySecret: string, region: string): Promise<{ token: string; expire: number }> {
  const endpoint = `https://nls-meta.${region}.aliyuncs.com/`;
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: region,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString(),
    Version: '2019-02-28',
  };
  const sortedKeys = Object.keys(params).sort();
  const canonicalized = sortedKeys.map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`).join('&');
  const stringToSign = `POST&%2F&${percentEncode(canonicalized)}`;
  const signature = createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64');
  const query = `${canonicalized}&Signature=${percentEncode(signature)}`;
  const res = await requestBuffer(`${endpoint}?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Buffer.from(''),
  });
  if (res.status >= 400) {
    throw new Error(`aliyun token rpc http ${res.status}: ${res.body.toString('utf-8')}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(res.body.toString('utf-8'));
  } catch (err) {
    throw new Error(`aliyun token rpc parse failed: ${(err as Error).message}`);
  }
  const token = parsed?.Token?.Id || parsed?.token || '';
  const exp = parsed?.Token?.ExpireTime || 0;
  if (!token) throw new Error(`aliyun token rpc missing token: ${res.body.toString('utf-8')}`);
  const expire = typeof exp === 'number' ? exp * 1000 : Date.now() + 5 * 60 * 1000;
  return { token, expire };
}

async function synthesizeAliyun(text: string, opts: { lang?: string; voice?: string; rate?: number }, cfg: AliyunConfig): Promise<Buffer> {
  if (!cfg) throw new Error('aliyun config missing');
  const token = await fetchAliyunToken(cfg);
  const region = cfg.region || 'cn-shanghai';
  const appKey = cfg.appKey || '';
  if (!appKey) throw new Error('aliyun appKey missing');
  const voice = opts.voice || cfg.voice || 'xiaoyun';
  const sampleRate = cfg.sampleRate || 16000;
  const rateNum = typeof opts.rate === 'number' ? opts.rate : 1;
  const speechRate = clamp(Math.round((rateNum - 1) * 100), -100, 100);
  const payload = {
    text,
    appkey: appKey,
    voice,
    format: 'wav',
    sample_rate: sampleRate,
    speech_rate: speechRate,
    volume: 50,
    pitch_rate: 0,
  };
  const body = Buffer.from(JSON.stringify(payload));
  const endpoint = `https://nls-gateway-${region}.aliyuncs.com/stream/v1/tts`;
  const res = await requestBuffer(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NLS-Token': token,
    },
    body,
  });
  if (res.status >= 400) {
    throw new Error(`aliyun tts http ${res.status}: ${res.body.toString('utf-8')}`);
  }
  const ctype = String(res.headers['content-type'] || '');
  if (ctype.includes('json')) {
    throw new Error(`aliyun tts error: ${res.body.toString('utf-8')}`);
  }
  return res.body;
}

async function synthesizeAzure(text: string, opts: { lang?: string; voice?: string; rate?: number }, cfg: AzureConfig): Promise<Buffer> {
  if (!cfg) throw new Error('azure config missing');
  const key = cfg.key || '';
  const region = cfg.region || '';
  if (!key || !region) throw new Error('azure key/region missing');
  const voice = opts.voice || cfg.voice || 'en-US-JennyNeural';
  const format = cfg.format || 'audio-16khz-32kbitrate-mono-mp3';
  const rateNum = typeof opts.rate === 'number' ? opts.rate : 1;
  const ratePercent = clamp(Math.round((rateNum - 1) * 100), -50, 100);
  const prosodyRate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  const lang = opts.lang || voice.split('-').slice(0, 2).join('-');
  const ssml = `<?xml version="1.0" encoding="utf-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${prosodyRate}">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</prosody></voice></speak>`;
  const body = Buffer.from(ssml, 'utf-8');
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await requestBuffer(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': format,
      'Ocp-Apim-Subscription-Key': key,
      'User-Agent': 'EnglishPod-TTS',
    },
    body,
  });
  if (res.status >= 400) {
    throw new Error(`azure tts http ${res.status}: ${res.body.toString('utf-8')}`);
  }
  return res.body;
}

async function synthesizeLocal(text: string, opts: { lang?: string; voice?: string; rate?: number }, cfg: LocalConfig): Promise<Buffer> {
  if (!cfg?.base) throw new Error('local base missing');
  const url = `${cfg.base.replace(/\/$/, '')}/tts`;
  const payload = {
    text,
    voice: opts.voice || cfg.voice,
    lang: opts.lang || 'en',
    rate: opts.rate ?? 1,
  };
  const body = Buffer.from(JSON.stringify(payload));
  const res = await requestBuffer(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (res.status >= 400) {
    throw new Error(`local tts http ${res.status}: ${res.body.toString('utf-8')}`);
  }
  return res.body;
}

export type EnsureTTSResult = {
  key: string;
  file: string;
  provider: string;
  cached: boolean;
  fallback: boolean;
  error?: string;
};

export async function ensureTTSFile(
  text: string,
  opts: { lang?: string; voice?: string; rate?: number | string } = {},
  config?: ModelsConfig | null,
): Promise<EnsureTTSResult> {
  const normalized = (text || '').trim();
  const lang = opts.lang || 'en';
  const rateNum = typeof opts.rate === 'number' ? opts.rate : parseFloat(String(opts.rate || '1')) || 1;
  const voicePref = opts.voice || '';
  const key = `${hashKey([normalized, lang, voicePref, rateNum.toFixed(2)])}.wav`;
  const dir = path.join(DATA_DIR, 'tts-cache');
  const file = path.join(dir, key);
  ensureDir(dir);
  if (fs.existsSync(file)) {
    return { key, file, provider: 'cache', cached: true, fallback: false };
  }

  let provider = 'local';
  let fallback = false;
  let error: string | undefined;

  try {
    if (!normalized) throw new Error('empty text');
    const cfg = config || null;
    const ttsCfg = cfg?.tts;
    provider = ttsCfg?.enabled ? ttsCfg.provider || 'local' : 'local';
    let buffer: Buffer | null = null;
    if (provider === 'aliyun') {
      buffer = await synthesizeAliyun(normalized, { lang, voice: voicePref, rate: rateNum }, ttsCfg?.providers?.aliyun || {});
    } else if (provider === 'azure') {
      buffer = await synthesizeAzure(normalized, { lang, voice: voicePref, rate: rateNum }, ttsCfg?.providers?.azure || {});
    } else if (provider === 'local') {
      const localCfg = ttsCfg?.providers?.local || {};
      if (localCfg.base) {
        buffer = await synthesizeLocal(normalized, { lang, voice: voicePref || localCfg.voice, rate: rateNum }, localCfg);
      } else {
        throw new Error('local provider not configured');
      }
    } else {
      throw new Error(`unsupported provider ${provider}`);
    }
    if (buffer && buffer.length > 0) {
      fs.writeFileSync(file, buffer);
      return { key, file, provider, cached: false, fallback: false };
    }
    throw new Error(`provider ${provider} returned empty buffer`);
  } catch (err: any) {
    fallback = true;
    error = err?.message || String(err);
    appendErrorLog(`[provider=${provider}] ${error}`);
    writeFallbackWav(file);
  }

  return { key, file, provider, cached: false, fallback, error };
}

export function getTTSAudioPath(filename: string) {
  const safe = String(filename).replace(/[^a-zA-Z0-9_.-]/g, '');
  return path.join(DATA_DIR, 'tts-cache', safe);
}
