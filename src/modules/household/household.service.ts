import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';

// Excludes visually similar characters (0/O, 1/I/L) since this code is
// meant to be read aloud or typed from a screenshot by the inviter relaying
// it to the invitee — a misread character here is a support ticket.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateAccessCode(): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');
}

/**
 * A resident inviting another person (e.g. a spouse) to get their own,
 * fully independent CommunityHub account without that person accruing a
 * second, duplicate dues/levy obligation for the same household — see
 * User.duesLiable and HouseholdInvite in schema.prisma for the full
 * rationale.
 *
 * No SMS/OTP anywhere in this flow — this app has no SMS provider, and a
 * real one costs money per message. Instead, the moment an admin approves
 * an invite, the account is created immediately with a random one-time
 * access code as its password (mustResetPassword: true) — the same
 * "temporary password, forced reset on first login" shape every
 * admin-created account already uses (see AdminService.createUser). The
 * inviter relays the code to the invitee however they like (in person, a
 * text message they send themselves, a phone call); the invitee logs in
 * through the completely ordinary login screen with their phone + that
 * code, and AuthService.completeForceReset clears the code and marks the
 * invite ACCEPTED the moment they set their own real password.
 */
@Injectable()
export class HouseholdService {
  constructor(private prisma: PrismaService) {}

  // ── Resident-facing ──────────────────────────────────────────────────
  /** Only residents who've actually logged in and completed their reset — an approved-but-unused invite's account technically exists already (see approveInvite) but doesn't belong here yet, since the invitee hasn't done anything. It still shows under myInvites() with its access code until then. */
  async members(userId: string) {
    const invites = await this.prisma.householdInvite.findMany({
      where: { invitedByUserId: userId, status: 'ACCEPTED' },
      select: {
        acceptedAt: true,
        acceptedUser: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { acceptedAt: 'desc' },
    });
    return invites
      .filter((i) => i.acceptedUser)
      .map((i) => ({ ...i.acceptedUser!, joinedAt: i.acceptedAt }));
  }

  private static readonly SAFE_INVITE_SELECT = {
    id: true,
    invitedPhone: true,
    invitedFullName: true,
    status: true,
    createdAt: true,
    respondedAt: true,
    accessCode: true,
  } as const;

  async myInvites(userId: string) {
    return this.prisma.householdInvite.findMany({
      where: { invitedByUserId: userId },
      select: HouseholdService.SAFE_INVITE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async invite(estateId: string, invitedByUserId: string, fullName: string, phone: string) {
    // Only the household's own registered resident can invite people in —
    // someone who was themselves invited (has an inviter of their own)
    // can't turn around and invite others, or households could chain
    // indefinitely with no single accountable resident.
    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: invitedByUserId },
      select: { invitedById: true },
    });
    if (inviter.invitedById) {
      throw new ForbiddenException('Only the resident who registered this household can invite other people.');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new ConflictException('Someone with that phone number already has an account.');
    }
    const existingInvite = await this.prisma.householdInvite.findFirst({
      where: { invitedPhone: phone, estateId, status: { not: 'REJECTED' } },
    });
    if (existingInvite) {
      throw new ConflictException('That phone number already has a pending or approved invitation.');
    }

    return this.prisma.householdInvite.create({
      data: { estateId, invitedByUserId, invitedPhone: phone, invitedFullName: fullName },
      select: HouseholdService.SAFE_INVITE_SELECT,
    });
  }

  async cancelInvite(userId: string, id: string) {
    const invite = await this.prisma.householdInvite.findFirst({ where: { id, invitedByUserId: userId } });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new ConflictException('Only a still-pending invitation can be cancelled.');
    }
    await this.prisma.householdInvite.delete({ where: { id } });
    return { message: 'Invitation cancelled.' };
  }

  // ── Admin-facing ─────────────────────────────────────────────────────
  async pendingInvites(estateId: string) {
    return this.prisma.householdInvite.findMany({
      where: { estateId, status: 'PENDING_ADMIN_APPROVAL' },
      select: {
        ...HouseholdService.SAFE_INVITE_SELECT,
        invitedBy: { select: { fullName: true, house: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** The "who joined a household and when" record an admin asked for — every invite that's actually been accepted (the invitee logged in with their code and set their own password), not merely approved. */
  async householdMembers(estateId: string) {
    const invites = await this.prisma.householdInvite.findMany({
      where: { estateId, status: 'ACCEPTED' },
      select: {
        acceptedAt: true,
        invitedBy: { select: { fullName: true, house: true } },
        acceptedUser: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { acceptedAt: 'desc' },
    });
    return invites
      .filter((i) => i.acceptedUser)
      .map((i) => ({ ...i.acceptedUser!, joinedAt: i.acceptedAt, invitedBy: i.invitedBy }));
  }

  /**
   * Creates the invitee's account right now, with a random access code as
   * its password — nothing about this waits for the invitee to do
   * anything. If that phone number somehow got claimed by a real signup in
   * the gap between invite() and this call, this fails loudly rather than
   * silently overwriting someone's real account.
   */
  async approveInvite(estateId: string, adminId: string, id: string) {
    const invite = await this.prisma.householdInvite.findFirst({
      where: { id, estateId },
      include: { invitedBy: { select: { house: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new ConflictException('This invitation has already been reviewed.');
    }
    const existingUser = await this.prisma.user.findUnique({ where: { phone: invite.invitedPhone } });
    if (existingUser) {
      throw new ConflictException('An account for that phone number already exists.');
    }

    const code = generateAccessCode();
    const passwordHash = await argon2.hash(code);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          estateId: invite.estateId,
          phone: invite.invitedPhone,
          fullName: invite.invitedFullName,
          // Same household, same address — the inviter already gave the
          // estate this information, so there's nothing new for the
          // invitee to provide here (see AuthService.completeForceReset
          // and ForceResetPage, which skip the profile-completion step
          // entirely for household-invited accounts as a result).
          house: invite.invitedBy.house,
          passwordHash,
          role: 'RESIDENT',
          invitedById: invite.invitedByUserId,
          duesLiable: false,
          mustResetPassword: true,
        },
      });
      await tx.householdInvite.update({
        where: { id },
        data: {
          status: 'APPROVED',
          respondedAt: new Date(),
          respondedByAdminId: adminId,
          accessCode: code,
          acceptedUserId: user.id,
        },
      });
    });

    return { message: 'Invitation approved. The access code is now visible to the inviter.' };
  }

  async rejectInvite(estateId: string, adminId: string, id: string) {
    const invite = await this.prisma.householdInvite.findFirst({ where: { id, estateId } });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new ConflictException('This invitation has already been reviewed.');
    }
    await this.prisma.householdInvite.update({
      where: { id },
      data: { status: 'REJECTED', respondedAt: new Date(), respondedByAdminId: adminId },
    });
    return { message: 'Invitation rejected.' };
  }
}
