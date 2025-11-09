import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
// CORS is configured via app.enableCors below

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  // Allow dev origins and cookies for cross-origin (localhost:3000/4000/4001)
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin or curl
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
