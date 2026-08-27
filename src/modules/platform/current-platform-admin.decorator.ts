import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface PlatformAuthPayload {
  sub: string;
  jti: string;
  scope: 'PLATFORM';
}

export interface RequestWithPlatformAdmin extends Request {
  platformAdmin: PlatformAuthPayload;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAuthPayload => {
    const request = ctx.switchToHttp().getRequest<RequestWithPlatformAdmin>();
    return request.platformAdmin;
  },
);
