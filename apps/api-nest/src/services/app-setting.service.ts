import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = any>(key: string, fallback: T): Promise<T> {
    const record = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!record) return fallback;
    return (record.value as T) ?? fallback;
  }

  async set(key: string, value: any) {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value, updated_at: new Date() },
      create: { key, value },
    });
  }
}
