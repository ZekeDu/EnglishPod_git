import { Body, Controller, Get, Post, Put, Query, Req, Res, Param, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../utils/data';
import * as crypto from 'crypto';
import { PrismaService } from '../services/prisma.service';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function randomId() { return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; }

@Controller('upload')
export class UploadController {
  constructor(private readonly prisma: PrismaService) {}
  // DEV 占位：返回一个“伪预签名”上传信息，URL 指向本 API 的直传接口
  @Get('presign')
  presign(@Query('ext') ext = 'webm') {
    const s3 = getS3Config();
    const day = new Date().toISOString().slice(0, 10);
    const key = `lesson-uploads/${day}/${randomId()}.${ext.replace(/[^a-z0-9]/gi, '')}`;
    if (s3) {
      const url = presignS3Put({ ...s3, key, expires: 600 });
      return { code: 200, message: 'ok', data: { method: 'PUT', url, headers: { 'Content-Type': 'application/octet-stream' }, key, finalUrl: url.split('?')[0] } };
    }
    const token = randomId();
    return {
      code: 200,
      message: 'ok',
      data: {
        method: 'PUT',
        url: `/upload/put?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`,
        headers: { 'Content-Type': 'application/octet-stream' },
        key,
        token,
        finalUrl: `local:uploads/${key}`
      }
    };
  }

  // DEV 直传：写入 DATA_DIR/uploads 下，返回 200
  @All('put')
  async put(@Req() req: Request, @Res() res: Response) {
    try {
      if (!['PUT','POST'].includes(String(req.method || '').toUpperCase())) {
        return res.status(405).json({ code: 405, message: 'error', data: { error: 'method not allowed' } });
      }
      const key = String(req.query.key || '').replace(/\.\.+/g, '.');
      if (!key) return res.status(400).json({ code: 400, message: 'error', data: { error: 'key required' } });
      // 可选的简易 token 校验（存在即通过，避免被误触发）
      if (!req.query.token) return res.status(400).json({ code: 400, message: 'error', data: { error: 'token required' } });
      // 限定存储路径前缀
      if (!/^lesson-uploads\//.test(key)) return res.status(400).json({ code: 400, message: 'error', data: { error: 'invalid key' } });
      const dir = path.join(DATA_DIR, 'uploads', path.dirname(key));
      ensureDir(dir);
      const filePath = path.join(DATA_DIR, 'uploads', key);
      const ws = fs.createWriteStream(filePath);
      const max = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024); // 10MB 默认
      let size = 0;
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: any) => {
          size += chunk.length || 0;
          if (size > max) {
            try { ws.destroy(); } catch {}
            try { (req as any).destroy(); } catch {}
            reject(new Error('Payload Too Large'));
          }
        });
        req.pipe(ws);
        ws.on('finish', () => resolve());
        ws.on('error', reject);
      });
      // 简单 MIME 校验：根据扩展名做白名单（可扩展为 magic 检测）
      const allowed = ['.webm','.wav','.mp3','.m4a','.ogg','.txt'];
      const ext = path.extname(filePath).toLowerCase();
      if (!allowed.includes(ext)) {
        try { fs.unlinkSync(filePath); } catch {}
        return res.status(415).json({ code: 415, message: 'error', data: { error: 'unsupported media type' } });
      }
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
          '.txt': 'text/plain',
        } as Record<string, string>
      )[ext] || 'application/octet-stream';
      const originalName = String(req.headers['x-original-name'] || path.basename(filePath));
      await this.prisma.upload.upsert({
        where: { key },
        update: { size, mime, original_name: originalName },
        create: { key, size, mime, original_name: originalName, user_id: null },
      });
      return res.json({ code: 200, message: 'ok', data: { key, url: `local:uploads/${key}` } });
    } catch (e) {
      const status = (e as any)?.message === 'Payload Too Large' ? 413 : 500;
      return res.status(status).json({ code: status, message: 'error', data: { error: 'upload failed' } });
    }
  }

  // 本地占位文件读取：将 local:uploads/{key} 映射为 /upload/file/{key}
  @Get('file/:key(*)')
  async file(@Param('key') key: string, @Res() res: Response) {
    try {
      const safeKey = String(key || '').replace(/\.\.+/g, '.');
      const filePath = path.join(DATA_DIR, 'uploads', safeKey);
      if (!fs.existsSync(filePath)) return res.status(404).end();
      const ext = path.extname(filePath).toLowerCase();
      const mime = ({
        '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
        '.wav': 'audio/wav', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.oga':'audio/ogg', '.txt':'text/plain'
      } as Record<string,string>)[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      fs.createReadStream(filePath).pipe(res);
    } catch {
      return res.status(500).end();
    }
  }
}

// 读取 S3/MinIO 配置（本地优先使用 MinIO）
function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT || '';
  const bucket = process.env.S3_BUCKET || '';
  const accessKey = process.env.S3_ACCESS_KEY || '';
  const secretKey = process.env.S3_SECRET_KEY || '';
  const region = process.env.S3_REGION || 'us-east-1';
  const forcePathStyle = /^true$/i.test(process.env.S3_FORCE_PATH_STYLE || 'true');
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { endpoint, bucket, accessKey, secretKey, region, forcePathStyle };
}

// 生成 S3 预签名 PUT URL（SigV4），兼容 MinIO
function presignS3Put({ endpoint, bucket, region, accessKey, secretKey, key, expires = 600, forcePathStyle = true }: any) {
  const url = new URL(endpoint);
  const host = forcePathStyle ? url.host : `${bucket}.${url.host}`;
  const canonicalUri = forcePathStyle ? `/${bucket}/${encodeURI(key)}` : `/${encodeURI(key)}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const datestamp = amzDate.slice(0, 8);
  const credentialScope = `${datestamp}/${region}/s3/aws4_request`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.keys(query).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&');
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const canonicalRequestHash = sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');
  const signingKey = getSigningKey(secretKey, datestamp, region, 's3');
  const signature = hmacHex(signingKey, stringToSign);
  const fullQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  const scheme = url.protocol || 'https:';
  return `${scheme}//${host}${canonicalUri}?${fullQuery}`;
}

function toAmzDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}
function sha256Hex(s: string) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac(key: Buffer | string, data: string) { return crypto.createHmac('sha256', key).update(data, 'utf8').digest(); }
function hmacHex(key: Buffer | string, data: string) { return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex'); }
function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}
