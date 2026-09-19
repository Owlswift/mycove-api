import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import type {
  AuthUser,
  RequestWithUser,
} from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    let payload: AuthUser;
    try {
      payload = this.jwt.verify<AuthUser>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const blacklisted = await this.prisma.blacklistedToken.findUnique({
      where: { tokenJti: payload.jti },
    });
    if (blacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { active: true, role: true, staffRoles: true },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException({
        message: 'This account has been deactivated. Contact your estate admin.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }
    // Tokens live for weeks, so take a removed staff role away immediately
    // rather than when the token eventually expires.
    if (![user.role, ...user.staffRoles].includes(payload.role)) {
      throw new UnauthorizedException(
        'Your access has changed. Please sign in again.',
      );
    }

    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
