import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    await this.authService.attachUserToRequest(req);
    const user = this.authService.getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException({ code: 403, message: 'error', data: { error: 'forbidden' } });
    }
    return true;
  }
}
