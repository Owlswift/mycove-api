import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { estate: true, invitedBy: { select: { fullName: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const initials = user.fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');

    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      house: user.house,
      email: user.email,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      vehiclePlates: user.vehiclePlates,
      initials,
      mustResetPassword: user.mustResetPassword,
      hasPin: user.pinHash != null,
      estateName: user.estate.name,
      estateAddress: user.estate.address,
      duesLiable: user.duesLiable,
      invitedByName: user.invitedBy?.fullName ?? null,
    };
  }

  /**
   * Self-service profile updates — the resident-facing path for adding or
   * changing an emergency contact (and email) at any time, not just during
   * first-login setup. Household-invited members in particular never saw
   * the profile-completion step (their profile was "already complete" per
   * HouseholdService.approveInvite), so this is their only way to add one
   * after onboarding.
   *
   * Deliberately excludes identity fields (phone, fullName, house, role,
   * duesLiable) — those are estate-managed data; letting a self-serve
   * PATCH rewrite them would undo what the admin/invite flow recorded.
   * Empty strings clear the field rather than being rejected.
   */
  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName?.trim() || null,
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
        }),
      },
    });

    // Same response shape as me() — callers refresh straight off it.
    return this.me(userId);
  }
}
