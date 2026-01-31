import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { AuthService } from '../services/auth.service';
import { buildAllowedOrigins, isOriginAllowed } from '../config/origins';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly allowedOrigins = buildAllowedOrigins();

  constructor(private readonly auth: AuthService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const method = String(req.method || '').toUpperCase();
    if (!UNSAFE_METHODS.has(method)) return next();

    const origin = (req.headers.origin || '') as string;
    if (origin) {
      if (!isOriginAllowed(origin, this.allowedOrigins)) {
        return res.status(403).json({ code: 403, message: 'error', data: { error: 'csrf_blocked' } });
      }
      return next();
    }

    // Requests without an Origin header are typically server-to-server (curl, internal jobs).
    // If there is an authenticated session cookie, require an explicit CSRF header.
    const token = this.auth.extractSessionToken(req);
    if (!token) return next();

    const header = String(req.headers['x-csrf-token'] || '').trim();
    if (!header) {
      return res.status(403).json({ code: 403, message: 'error', data: { error: 'csrf_token_required' } });
    }

    const secret = String(process.env.SESSION_SECRET || process.env.CSRF_SECRET || '');
    if (!secret && /^production$/i.test(process.env.NODE_ENV || '')) {
      return res.status(403).json({ code: 403, message: 'error', data: { error: 'csrf_misconfigured' } });
    }
    const expected = this.authCsrfToken(token, secret);
    if (header !== expected) {
      return res.status(403).json({ code: 403, message: 'error', data: { error: 'csrf_invalid' } });
    }

    return next();
  }

  private authCsrfToken(sessionToken: string, secret: string) {
    // Simple HMAC token: attacker cannot forge without secret; browser attacker cannot read it due to SOP.
    // If secret is empty (dev), it still provides a non-empty token requirement for no-Origin paths.
    return crypto.createHmac('sha256', secret || 'dev').update(`csrf:${sessionToken}`).digest('hex');
  }
}
