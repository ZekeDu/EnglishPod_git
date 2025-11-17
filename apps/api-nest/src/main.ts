import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
// CORS is configured via app.enableCors below

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  /*
   * Allow configured origins + localhost for development so that
   * production domains such as https://zekezone.cn can call the API
   * without hitting “Failed to fetch / CORS” errors.
   */
  const parseOrigins = (...values: (string | undefined)[]) =>
    values
      .flatMap((value) => (value ?? '').split(','))
      .map((v) => v.trim())
      .filter(Boolean)
      .map((origin) => origin.replace(/\/$/, ''));

  const extraOrigins = parseOrigins(
    process.env.CORS_ORIGINS,
    process.env.NEXT_PUBLIC_API_BASE,
    process.env.NEXT_PUBLIC_WEB_ORIGIN,
    process.env.PUBLIC_WEB_ORIGIN,
  );
  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:4001',
    ...extraOrigins,
  ]);

  app.enableCors({
    origin: (origin, cb) => {
      // eslint-disable-next-line no-console
      if (!origin) return cb(null, true); // same-origin or curl
      if (allowedOrigins.has(origin)) return cb(null, true);
      const ok = /^(http:\/\/(localhost|127\.0\.0\.1):\d{2,5})$/i.test(origin);
      return cb(null, ok);
    },
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  });

  const startPort = process.env.PORT ? Number(process.env.PORT) : 4000;
  const maxTries = 5;
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    try {
      await app.listen(port);
      // eslint-disable-next-line no-console
      console.log(`Nest API running at http://localhost:${port}`);
      return;
    } catch (e: any) {
      if (e?.code === 'EADDRINUSE' && i < maxTries - 1) {
        // eslint-disable-next-line no-console
        console.warn(`Port ${port} in use, trying ${port + 1}...`);
        continue;
      }
      throw e;
    }
  }
}

bootstrap();
