import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import type {
  PlatformAuthPayload,
  RequestWithPlatformAdmin,
} from './current-platform-admin.decorator';

/**
 * Deliberately separate from JwtAuthGuard rather than a variant of it —
 * that guard always resolves `payload.sub` against the User table, which
 * has no row for a PlatformAdmin. Distinguishing by a `scope: 'PLATFORM'`
 * claim (rather than trying both lookups) also means a stolen estate-user
 * token can never be replayed against platform routes, and vice versa.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithPlatformAdmin>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('No token provided');

    let payload: PlatformAuthPayload;
    try {
      payload = this.jwt.verify<PlatformAuthPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.scope !== 'PLATFORM') {
      throw new UnauthorizedException('Invalid token');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { active: true },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    request.platformAdmin = payload;
    return true;
  }

  private extractToken(request: RequestWithPlatformAdmin): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
