import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { PrismaService } from '../services/prisma.service';

@Controller()
export class SubscriptionController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me/subscription')
  async meSub(@Req() req: Request, @Res() res: Response) {
    const user = await this.authService.attachUserToRequest(req);
    if (!user) return res.status(401).json({ code: 401, message: 'error', data: { error: 'unauthorized' } });
    const sub = await this.prisma.userSubscription.findFirst({ where: { user_id: user.id } });
    if (!sub) {
      return res.json({ code: 200, message: 'ok', data: { status: 'none' } });
    }
    return res.json({
      code: 200,
      message: 'ok',
      data: {
        plan: sub.plan,
        status: sub.status,
        expire_at: sub.expire_at?.toISOString?.() ?? sub.expire_at,
        updated_at: sub.updated_at?.toISOString?.() ?? sub.updated_at,
      },
    });
  }

  @Post('billing/checkout')
  async checkout(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const user = await this.authService.attachUserToRequest(req);
    if (!user) return res.status(401).json({ code: 401, message: 'error', data: { error: 'unauthorized' } });
    const plan = String(body?.plan || 'monthly');
    const days = plan === 'yearly' ? 365 : 30;
    const expire_at = new Date(Date.now() + days * 86400000);
    const result = await this.prisma.userSubscription.upsert({
      where: { user_id: user.id },
      update: { plan, status: 'active', expire_at },
      create: { user_id: user.id, plan, status: 'active', expire_at },
    });
    return res.json({
      code: 200,
      message: 'ok',
      data: {
        checkoutId: 'mock',
        status: result.status,
        plan: result.plan,
        expire_at: expire_at.toISOString(),
      },
    });
  }
}
