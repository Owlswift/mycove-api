import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import type { Request } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The admin web app (mycove-admin) is a separate origin hitting
  // this same API — reflect the request origin rather than hardcoding a
  // port, since local dev tooling picks whatever port is free.
  app.enableCors({ origin: true, credentials: true });

  // Default 100kb JSON limit is too small for project/report media (images
  // and short video clips) sent as base64 in the request body. The
  // `verify` callback stashes the exact raw bytes onto the request too —
  // needed by PaymentsWebhookController to HMAC-verify Paystack's
  // x-paystack-signature header, which must be computed over the raw body,
  // not the re-serialized parsed JSON (those aren't guaranteed identical).
  app.use(
    json({
      limit: '25mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  const logger = new Logger('Bootstrap');

  await app.listen(port, '0.0.0.0');
  logger.log(`MyCove API running on http://0.0.0.0:${port}`);
}
void bootstrap();
