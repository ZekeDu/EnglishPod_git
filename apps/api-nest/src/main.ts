import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import express from 'express';
import { buildAllowedOrigins, isOriginAllowed } from './config/origins';
import { loadEnvFiles } from './config/env-file';
// CORS is configured via app.enableCors below

async function bootstrap() {
  loadEnvFiles();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const allowedOrigins = buildAllowedOrigins();

  const instance = app.getHttpAdapter().getInstance();
  // Trust proxy (for correct req.ip / secure cookies behind reverse proxies)
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    const value = /^true$/i.test(trustProxy) ? 1 : Number(trustProxy);
    instance.set('trust proxy', Number.isFinite(value) ? value : 1);
  }
  instance.disable('x-powered-by');

  // Request body limits (reduce DoS surface)
  const jsonLimit = process.env.JSON_BODY_LIMIT || '1mb';
  const urlencodedLimit = process.env.URLENCODED_BODY_LIMIT || '1mb';
  instance.use(express.json({ limit: jsonLimit }));
  instance.use(express.urlencoded({ extended: true, limit: urlencodedLimit }));

  // Basic security headers (helmet-like minimal set; keep dependency-free)
  instance.use((req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (/^production$/i.test(process.env.NODE_ENV || '')) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  app.enableCors({
    origin: (origin, cb) => {
      return cb(null, isOriginAllowed(origin, allowedOrigins));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
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
