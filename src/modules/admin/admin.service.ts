import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

/**
 * The estate has no self-registration — an admin creates every account with
 * just the essentials, and the default password is the resident/guard's own
 * surname in caps (the last word of their full name), communicated to them
 * out-of-band (no SMS provider is wired up). They're forced to change it,
 * and complete the rest of their profile, on first login.
 */
function defaultPasswordFor(fullName: string): string {
  const surname = fullName.trim().split(/\s+/).pop();
  return (surname ?? fullName).toUpperCase();
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        house: true,
        email: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        vehiclePlates: true,
        mustResetPassword: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException(
        'A user with that phone number already exists.',
      );
    }

    const defaultPassword = defaultPasswordFor(dto.fullName);
    const passwordHash = await argon2.hash(defaultPassword);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        fullName: dto.fullName,
        role: dto.role,
        house: dto.house,
        passwordHash,
        mustResetPassword: true,
      },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        house: true,
      },
    });
    return { ...user, defaultPassword };
  }

  async resetPassword(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const defaultPassword = defaultPasswordFor(user.fullName);
    const passwordHash = await argon2.hash(defaultPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustResetPassword: true },
    });
    return { defaultPassword };
  }
}
