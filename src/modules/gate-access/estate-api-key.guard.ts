import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';

export interface RequestWithEstate extends Request {
  estateId: string;
}

/**
 * For gate hardware calling MyCove machine-to-machine — no resident/guard
 * is logged in on the other end, so the usual JwtAuthGuard doesn't apply.
 * The hardware sends the estate's shared secret as X-Api-Key on every
 * call; this looks it up directly against Estate.gateApiKey (stored raw,
 * see that field's schema comment) and attaches the matching estateId to
 * the request for the controller/service to use.
 */
@Injectable()
export class EstateApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithEstate>();
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing X-Api-Key header');
    }

    const estate = await this.prisma.estate.findUnique({
      where: { gateApiKey: apiKey },
      select: { id: true },
    });
    if (!estate) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.estateId = estate.id;
    return true;
  }
}
