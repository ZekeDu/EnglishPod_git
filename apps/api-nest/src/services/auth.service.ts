import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { Prisma, User, UserSession } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { parseCookies } from '../utils/auth';

export interface SessionMetadata {
  ip?: string | null;
  userAgent?: string | null;
}

type SessionWithUser = UserSession & { user: User };

@Injectable()
export class AuthService {
  private rateLimitBuckets = new Map<string, { count: number; reset: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private get sessionCookieName() {
    return process.env.SESSION_COOKIE_NAME || 'sid';
  }

  private get sessionDays() {
    return Number(process.env.SESSION_DAYS || 7);
  }

  private get loginWindowMs() {
    return Number(process.env.AUTH_LOGIN_WINDOW_MS || 10 * 60 * 1000);
  }

  private get loginMaxFailures() {
    return Number(process.env.AUTH_LOGIN_MAX_FAILURES || 5);
  }

  private get captchaTtlMs() {
    return Number(process.env.AUTH_CAPTCHA_TTL_MS || 2 * 60 * 1000);
  }

  private get captchaLength() {
    return Math.max(4, Number(process.env.AUTH_CAPTCHA_LENGTH || 5));
  }

  private get captchaMaxAttempts() {
    return Number(process.env.AUTH_CAPTCHA_MAX_ATTEMPTS || 3);
  }

  private get rateLimitWindowMs() {
    return Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60 * 1000);
  }

  private get rateLimitLoginMax() {
    return Number(process.env.AUTH_RATE_LIMIT_LOGIN_MAX || 30);
  }

  private get rateLimitSignupMax() {
    return Number(process.env.AUTH_RATE_LIMIT_SIGNUP_MAX || 10);
  }

  private hashSessionToken(token: string) {
    return `sha256:${createHash('sha256').update(token).digest('hex')}`;
  }

  normalizeUsername(input: string) {
    return input.trim().toLowerCase();
  }

  async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { last_login_at: new Date() },
    });
  }

  private sessionExpiry(): Date {
    return new Date(Date.now() + this.sessionDays * 86400000);
  }

  private generateSessionToken() {
    return randomBytes(24).toString('hex');
  }

  async createSession(userId: string, meta: SessionMetadata = {}) {
    const token = this.generateSessionToken();
    const stored = this.hashSessionToken(token);
    const expires_at = this.sessionExpiry();
    await this.prisma.userSession.create({
      data: {
        user_id: userId,
        session_token: stored,
        expires_at,
        ip: meta.ip || null,
        user_agent: meta.userAgent || null,
      },
    });
    return { token, expires_at };
  }

  async revokeSession(token: string) {
    if (!token) return;
    const now = new Date();
    const stored = this.hashSessionToken(token);
    await this.prisma.userSession.updateMany({
      where: { OR: [{ session_token: token }, { session_token: stored }] },
      data: { revoked_at: now, expires_at: now },
    });
  }

  async revokeUserSessions(userId: string) {
    const now = new Date();
    await this.prisma.userSession.updateMany({
      where: { user_id: userId },
      data: { revoked_at: now, expires_at: now },
    });
  }

  extractSessionToken(req: Request) {
    const cookies = parseCookies(req);
    const sid = cookies[this.sessionCookieName];
    return sid || null;
  }

  async getActiveSession(token: string): Promise<SessionWithUser | null> {
    if (!token) return null;
    const stored = this.hashSessionToken(token);
    const session = await this.prisma.userSession.findFirst({
      where: {
        OR: [{ session_token: token }, { session_token: stored }],
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!session) return null;
    // Opportunistically migrate legacy plaintext tokens to hashed-at-rest.
    if (session.session_token === token) {
      try {
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { session_token: stored },
        });
      } catch {
        // ignore migration failure
      }
    }
    return session;
  }

  async attachUserToRequest(req: Request) {
    const marker = '__userChecked';
    if ((req as any)[marker]) {
      return ((req as any).__user || null) as User | null;
    }
    (req as any)[marker] = true;
    const token = this.extractSessionToken(req);
    if (!token) return null;
    const session = await this.getActiveSession(token);
    if (!session) return null;
    (req as any).__user = session.user;
    (req as any).__session = session;
    return session.user;
  }

  getUserFromRequest(req: Request): User | null {
    return ((req as any).__user || null) as User | null;
  }

  getSessionFromRequest(req: Request): SessionWithUser | null {
    return ((req as any).__session || null) as SessionWithUser | null;
  }

  setSessionCookie(res: Response, token: string, expires: Date) {
    const secure = /^true$/i.test(process.env.COOKIE_SECURE || '') || /^production$/i.test(process.env.NODE_ENV || '');
    const maxAge = Math.max(0, expires.getTime() - Date.now());
    res.cookie(this.sessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      expires,
      maxAge,
      path: '/',
    });
  }

  clearSessionCookie(res: Response) {
    const secure = /^true$/i.test(process.env.COOKIE_SECURE || '') || /^production$/i.test(process.env.NODE_ENV || '');
    res.clearCookie(this.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    });
  }

  private consumeRateLimit(bucketKey: string, limit: number) {
    if (!bucketKey) return true;
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.reset <= now) {
      this.rateLimitBuckets.set(bucketKey, { count: 1, reset: now + this.rateLimitWindowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  enforceLoginRateLimit(ip: string | undefined | null, username?: string | null) {
    const keyParts = ['login'];
    if (ip) keyParts.push(`ip:${ip}`);
    if (username) keyParts.push(`user:${this.normalizeUsername(username)}`);
    const key = keyParts.join('|');
    return this.consumeRateLimit(key, this.rateLimitLoginMax);
  }

  enforceSignupRateLimit(ip: string | undefined | null) {
    const key = `signup|ip:${ip || 'unknown'}`;
    return this.consumeRateLimit(key, this.rateLimitSignupMax);
  }

  async recordLoginAttempt(params: { username?: string | null; success: boolean; ip?: string | null; userId?: string | null }) {
    const { username, success, ip, userId } = params;
    await this.prisma.loginAttempt.create({
      data: {
        username: username ? this.normalizeUsername(username) : null,
        success,
        ip: ip || null,
        user_id: userId || null,
      },
    });
  }

  async recentFailedAttempts(username?: string | null, ip?: string | null) {
    const since = new Date(Date.now() - this.loginWindowMs);
    return this.prisma.loginAttempt.count({
      where: {
        created_at: { gte: since },
        success: false,
        OR: [
          username ? { username: this.normalizeUsername(username) } : undefined,
          ip ? { ip } : undefined,
        ].filter(Boolean) as any,
      },
    });
  }

  async shouldRequireCaptcha(username?: string | null, ip?: string | null) {
    if (!username && !ip) return false;
    const failures = await this.recentFailedAttempts(username, ip);
    return failures >= this.loginMaxFailures;
  }

  private captchaHash(answer: string) {
    return createHash('sha256').update(answer.toLowerCase()).digest('hex');
  }

  private generateCaptchaText() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < this.captchaLength; i += 1) {
      const idx = Math.floor(Math.random() * alphabet.length);
      out += alphabet[idx];
    }
    return out;
  }

  private captchaSvg(text: string) {
    const width = 120;
    const height = 40;
    const noise = Array.from({ length: 6 }).map(() => {
      const x1 = Math.random() * width;
      const y1 = Math.random() * height;
      const x2 = Math.random() * width;
      const y2 = Math.random() * height;
      const stroke = `rgba(0,0,0,${(Math.random() * 0.4 + 0.1).toFixed(2)})`;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}" stroke-width="1"/>`;
    }).join('');
    const chars = text.split('').map((ch, idx) => {
      const x = 15 + idx * (width / this.captchaLength);
      const y = 20 + (Math.random() * 10 - 5);
      const rotate = Math.random() * 30 - 15;
      return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="24" transform="rotate(${rotate.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})">${ch}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="#333"><rect width="100%" height="100%" fill="#f4f7fb"/>${noise}${chars}</svg>`;
  }

  async createCaptcha(ip?: string | null) {
    await this.prisma.captchaChallenge.deleteMany({
      where: { expires_at: { lt: new Date() } },
    });
    const answer = this.generateCaptchaText();
    const token = randomBytes(16).toString('hex');
    const expires_at = new Date(Date.now() + this.captchaTtlMs);
    await this.prisma.captchaChallenge.create({
      data: {
        token,
        answer: this.captchaHash(answer),
        ip: ip || null,
        expires_at,
      },
    });
    const svg = this.captchaSvg(answer);
    const payload = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return { token, image: payload, expires_at };
  }

  async verifyCaptcha(token: string, answer: string) {
    if (!token || !answer) return false;
    const challenge = await this.prisma.captchaChallenge.findUnique({ where: { token } });
    if (!challenge) return false;
    if (challenge.expires_at.getTime() < Date.now()) {
      await this.prisma.captchaChallenge.delete({ where: { token } });
      return false;
    }
    const hashed = this.captchaHash(answer);
    const success = hashed === challenge.answer;
    if (success) {
      await this.prisma.captchaChallenge.delete({ where: { token } });
      return true;
    }
    const attempts = challenge.attempts + 1;
    if (attempts >= this.captchaMaxAttempts) {
      await this.prisma.captchaChallenge.delete({ where: { token } });
    } else {
      await this.prisma.captchaChallenge.update({
        where: { token },
        data: { attempts },
      });
    }
    return false;
  }
}
