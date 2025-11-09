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
