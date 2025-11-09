import * as crypto from 'crypto';
import { IncomingMessage } from 'http';

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, saltedHash: string) {
  const [salt, hash] = saltedHash.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers['cookie'];
  if (!header) return {};
  const out: Record<string, string> = {};
  header.split(';').forEach((p) => { const [k, ...v] = p.trim().split('='); out[k] = decodeURIComponent(v.join('=')); });
  return out;
}

export function getUserFromRequest(req: IncomingMessage) {
  return (req as any).__user || null;
}

export function validatePasswordStrength(password: string): string | null {
  const val = String(password || '');
  if (val.length < 8) return '密码长度至少 8 位';
  const hasLower = /[a-z]/.test(val);
  const hasUpper = /[A-Z]/.test(val);
  const hasDigit = /\d/.test(val);
  if (!(hasLower && hasUpper && hasDigit)) {
    return '密码需同时包含大小写字母与数字';
  }
  return null;
}
