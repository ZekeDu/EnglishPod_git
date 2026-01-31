import * as crypto from 'crypto';
import { IncomingMessage } from 'http';

const PBKDF2_DIGEST = 'sha512';
const PBKDF2_KEYLEN = 64;
const PBKDF2_ITERATIONS = Math.max(100_000, Number(process.env.AUTH_PBKDF2_ITERATIONS || 100_000));

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  // Versioned format for forward compatibility:
  // pbkdf2$<iterations>$<saltHex>$<hashHex>
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, saltedHash: string) {
  const value = String(saltedHash || '');
  if (value.startsWith('pbkdf2$')) {
    const parts = value.split('$');
    const iterations = Number(parts[1] || 0);
    const salt = String(parts[2] || '');
    const hash = String(parts[3] || '');
    if (!iterations || !salt || !hash) return false;
    const check = crypto
      .pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
    if (hash.length !== check.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  }
  // Legacy format:
  // <saltHex>:<hashHex>
  const [salt, hash] = value.split(':');
  if (!salt || !hash) return false;
  const check = crypto.pbkdf2Sync(password, salt, 10_000, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  if (hash.length !== check.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers['cookie'];
  if (!header) return {};
  const out: Record<string, string> = {};
  header.split(';').forEach((p) => {
    const [k, ...v] = p.trim().split('=');
    const key = String(k || '').trim();
    if (!key) return;
    const raw = v.join('=');
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      // Ignore malformed values rather than throwing and breaking auth.
      out[key] = raw;
    }
  });
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
