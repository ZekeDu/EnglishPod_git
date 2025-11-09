import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { PrismaService } from '../services/prisma.service';
import { getUserFromRequest, hashPassword, verifyPassword } from '../utils/auth';

function pickUsername(body: any) {
  const username = String(body?.username ?? '').trim();
  if (username) return username;
  const identifier = String(body?.email ?? '').trim();
  return identifier;
}

function pickEmail(body: any) {
  const email = String(body?.email ?? '').trim();
  return email && email.includes('@') ? email.toLowerCase() : null;
}

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('auth/signup')
  async signup(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const rawUsername = pickUsername(body);
    const password = String(body?.password ?? '');
    if (!rawUsername || !password) {
      return res.status(400).json({ code: 400, message: 'error', data: { error: 'username/password required' } });
    }
    const username = this.authService.normalizeUsername(rawUsername);
    const email = pickEmail(body);
    const existing = await this.authService.findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ code: 409, message: 'error', data: { error: 'username exists' } });
    }
    const total = await this.prisma.user.count();
    const role = total === 0 ? 'admin' : 'user';
    const data: Prisma.UserCreateInput = {
      username,
      email,
      password_hash: hashPassword(password),
      role,
    };
    const user = await this.authService.createUser(data);
    const session = await this.authService.createSession(user.id, { ip: req.ip, userAgent: req.headers['user-agent']?.toString() });
    this.authService.setSessionCookie(res, session.token, session.expires_at);
    return res.json({ code: 200, message: 'ok', data: { id: user.id, username: user.username, role: user.role } });
  }

  @Post('auth/login')
  async login(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const rawUsername = pickUsername(body);
    const password = String(body?.password ?? '');
    const captchaToken = String(body?.captchaToken ?? body?.captcha_token ?? '').trim();
    const captchaAnswer = String(body?.captchaAnswer ?? body?.captcha ?? '').trim();
    if (!rawUsername || !password) {
      return res.status(400).json({ code: 400, message: 'error', data: { error: 'username/password required' } });
    }
    const username = this.authService.normalizeUsername(rawUsername);
    const requireCaptcha = await this.authService.shouldRequireCaptcha(username, req.ip);
    if (requireCaptcha) {
      const ok = await this.authService.verifyCaptcha(captchaToken, captchaAnswer);
      if (!ok) {
        return res.status(400).json({ code: 400, message: 'error', data: { error: 'captcha_required', captchaRequired: true } });
      }
    }
    const user = await this.authService.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      await this.authService.recordLoginAttempt({ username, success: false, ip: req.ip, userId: user?.id });
      const captchaRequiredNext = await this.authService.shouldRequireCaptcha(username, req.ip);
      return res.status(401).json({ code: 401, message: 'error', data: { error: 'invalid credentials', captchaRequired: captchaRequiredNext } });
    }
    await this.authService.recordLoginAttempt({ username, success: true, ip: req.ip, userId: user.id });
    await this.authService.updateLastLogin(user.id);
    const session = await this.authService.createSession(user.id, { ip: req.ip, userAgent: req.headers['user-agent']?.toString() });
    this.authService.setSessionCookie(res, session.token, session.expires_at);
    return res.json({ code: 200, message: 'ok', data: { id: user.id, username: user.username, role: user.role } });
  }

  @Post('auth/logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = this.authService.extractSessionToken(req);
    if (token) {
      await this.authService.revokeSession(token);
    }
    this.authService.clearSessionCookie(res);
    return res.json({ code: 200, message: 'ok', data: { logout: true } });
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    await this.authService.attachUserToRequest(req);
    const u = getUserFromRequest(req);
    if (!u) return res.status(401).json({ code: 401, message: 'error', data: { error: 'unauthorized' } });
    return res.json({ code: 200, message: 'ok', data: { id: u.id, username: u.username, role: u.role, email: u.email } });
  }

  @Get('auth/captcha')
  async captcha(@Req() req: Request, @Res() res: Response) {
    const challenge = await this.authService.createCaptcha(req.ip);
    return res.json({
      code: 200,
      message: 'ok',
      data: {
        token: challenge.token,
        image: challenge.image,
        expires_at: challenge.expires_at.toISOString(),
      },
    });
  }
}
