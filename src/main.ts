import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
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

  // Verbose request/response logging: POST/PUT always log (the actions
  // that actually change something), success or failure. GET/DELETE/PATCH
  // are otherwise silent — too frequent (the resident/guard bootstrap
  // alone fires ~17 GETs) to be useful noise — EXCEPT when they fail
  // (status >= 400), which always logs regardless of method, since a
  // failing read is exactly the kind of thing a client-reported
  // "something went wrong" turns out to be and must not go invisible.
  // Placed after json() so req.body is already parsed by the time it runs.
  const httpLogger = new Logger('HTTP');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const { method, originalUrl } = req;
    const chunks: Buffer[] = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.from(chunk as never));
      return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof res.write;
    res.end = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.from(chunk as never));
      return (originalEnd as (...a: unknown[]) => Response)(chunk, ...args);
    }) as typeof res.end;
    res.on('finish', () => {
      const isMutating = method === 'POST' || method === 'PUT';
      if (!isMutating && res.statusCode < 400) return;
      const ms = Date.now() - start;
      let body = safeJsonString(Buffer.concat(chunks).toString('utf8'));
      if (body.length > 2000) body = body.slice(0, 2000) + '…';
      const log = res.statusCode >= 400 ? httpLogger.warn.bind(httpLogger) : httpLogger.log.bind(httpLogger);
      log(
        `${method} ${originalUrl} -> ${res.statusCode} (${ms}ms)\n` +
          `    request body: ${safeJson(req.body)}\n` +
          `    response: ${body}`,
      );
    });
    next();
  });

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
const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'pin',
  'accessToken',
  'refreshToken',
  'resetToken',
]);

function safeJson(body: unknown): string {
  if (!body || typeof body !== 'object') return String(body);
  const redacted = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACTED_KEYS.has(k) ? '[redacted]' : v,
    ]),
  );
  return JSON.stringify(redacted);
}

// Response bodies arrive as a raw string (captured off the wire, not
// req.body), so this mirrors safeJson's redaction after parsing it —
// login/refresh responses carry fresh accessToken/refreshToken values
// that must never land in plaintext logs, same as the request-side
// versions safeJson already redacts. Falls back to the raw string for a
// non-JSON or non-object response body (e.g. plain text, an array).
function safeJsonString(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw;
  return safeJson(parsed);
}

void bootstrap();
