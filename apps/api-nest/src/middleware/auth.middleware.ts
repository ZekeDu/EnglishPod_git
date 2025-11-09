import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, _: Response, next: NextFunction) {
    try {
      await this.authService.attachUserToRequest(req);
    } catch (e) {
      // swallow errors to avoid blocking the request; logs handled at controller/service layer if needed
    }
    next();
  }
}
