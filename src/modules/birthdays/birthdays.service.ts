import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BirthdayCelebration, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PushService } from '../push/push.service';
import {
  birthdayIn,
  CalendarDate,
  daysUntil,
  formatBirthday,
  isValidBirthday,
  nextBirthday,
  partyAnnouncement,
  PROMPT_DAYS_BEFORE,
  spotlightMessage,
  todayInEstate,
} from './birthday-calc';
import { RespondBirthdayDto } from './dto/respond-birthday.dto';

type Celebrant = Pick<User, 'id' | 'estateId' | 'fullName' | 'birthMonth' | 'birthDay'>;

/**
 * Birthdays on the estate's spotlight.
 *
 * A resident gives their day and month once. A week before it, the app asks
 * them for a photo and whether there'll be a party. Their answer puts them
 * on the spotlight with an automatic message; if there's a party, the whole
 * estate is told when and where straight away. If there isn't, nothing more
 * goes out until the morning of the birthday, when everyone gets a push so
 * they can wish them well. The spotlight comes down the day after.
 */
@Injectable()
export class BirthdaysService {
  private readonly logger = new Logger(BirthdaysService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  // ── Birthday on the profile ────────────────────────────────────────────

  async setBirthday(userId: string, month: number, day: number) {
    if (!isValidBirthday(month, day)) {
      throw new BadRequestException('That is not a real date.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { birthMonth: month, birthDay: day },
      select: { id: true, birthMonth: true, birthDay: true },
    });
  }

  // ── What the app shows the resident ────────────────────────────────────

  /**
   * The resident's birthday and, once it is within a week, this year's
   * celebration to respond to. `needsResponse` is what the app uses to show
   * the prompt.
   */
  async mine(userId: string, now: Date = new Date()) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, estateId: true, fullName: true, birthMonth: true, birthDay: true, role: true },
    });
    if (user.birthMonth === null || user.birthDay === null) {
      return { birthMonth: null, birthDay: null, daysUntil: null, celebration: null, needsResponse: false };
    }

    const today = todayInEstate(now);
    const next = nextBirthday(today, user.birthMonth, user.birthDay);
    const days = daysUntil(today, next);
    const base = { birthMonth: user.birthMonth, birthDay: user.birthDay, daysUntil: days };
    if (days > PROMPT_DAYS_BEFORE) return { ...base, celebration: null, needsResponse: false };

    const celebration = await this.ensureCelebration(user, next.year);
    return { ...base, celebration: this.present(celebration), needsResponse: celebration.respondedAt === null };
  }

  /** The celebrant's answer to the photo + party prompt. */
  async respond(userId: string, dto: RespondBirthdayDto, now: Date = new Date()) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.birthMonth === null || user.birthDay === null) {
      throw new BadRequestException('Add your birthday first.');
    }
    const today = todayInEstate(now);
    const next = nextBirthday(today, user.birthMonth, user.birthDay);
    if (daysUntil(today, next) > PROMPT_DAYS_BEFORE) {
      throw new BadRequestException('Your birthday is not close enough yet — you can answer within a week of it.');
    }

    let partyAt: Date | null = null;
    if (dto.hasParty) {
      partyAt = new Date(dto.partyAt!);
      if (partyAt.getTime() < now.getTime()) {
        throw new BadRequestException('The party time has already passed.');
      }
    }

    const existing = await this.ensureCelebration(user, next.year);
    const partyChanged =
      dto.hasParty &&
      (existing.hasParty !== true ||
        existing.partyAt?.getTime() !== partyAt!.getTime() ||
        existing.partyVenue !== (dto.partyVenue ?? null));

    const celebration = await this.prisma.birthdayCelebration.update({
      where: { id: existing.id },
      data: {
        photoBase64: dto.photoBase64 ?? existing.photoBase64,
        hasParty: dto.hasParty,
        partyAt: dto.hasParty ? partyAt : null,
        partyVenue: dto.hasParty ? (dto.partyVenue?.trim() || null) : null,
        respondedAt: now,
      },
    });

    await this.syncSpotlight(user, celebration, next, today);

    if (dto.hasParty && partyChanged) {
      await this.announceParty(user, celebration, existing.partyAnnouncedAt !== null);
    }
    return this.present(celebration);
  }

  // ── The daily sweep ────────────────────────────────────────────────────

  /** 8:00 every morning: prompt, wish, and take down old spotlights. */
  @Cron('0 8 * * *', { timeZone: 'Africa/Lagos' })
  async dailySweep(): Promise<void> {
    try {
      await this.sweep(new Date());
    } catch (e) {
      this.logger.error(`Birthday sweep failed: ${(e as Error).message}`);
    }
  }

  async sweep(now: Date) {
    const today = todayInEstate(now);
    const celebrants = await this.prisma.user.findMany({
      where: { role: 'RESIDENT', active: true, birthMonth: { not: null }, birthDay: { not: null } },
      select: { id: true, estateId: true, fullName: true, birthMonth: true, birthDay: true },
    });

    let prompted = 0;
    let wished = 0;
    for (const user of celebrants) {
      const next = nextBirthday(today, user.birthMonth!, user.birthDay!);
      const days = daysUntil(today, next);

      if (days === PROMPT_DAYS_BEFORE) {
        const celebration = await this.ensureCelebration(user, next.year);
        if (!celebration.promptedAt) {
          await this.prisma.birthdayCelebration.update({ where: { id: celebration.id }, data: { promptedAt: now } });
          await this.push.sendToUser(user.id, {
            title: 'Your birthday is coming up 🎂',
            body: `Add a photo and tell the estate if you're having a party on ${formatBirthday({ month: user.birthMonth!, day: user.birthDay! })}.`,
            data: { type: 'birthday_prompt' },
          });
          prompted++;
        }
      } else if (days === 0) {
        let celebration = await this.ensureCelebration(user, next.year);
        await this.syncSpotlight(user, celebration, next, today);
        celebration = await this.prisma.birthdayCelebration.findUniqueOrThrow({ where: { id: celebration.id } });
        if (!celebration.wishSentAt) {
          await this.wishEstate(user, celebration);
          await this.prisma.birthdayCelebration.update({ where: { id: celebration.id }, data: { wishSentAt: now } });
          wished++;
        }
      }
    }

    const takenDown = await this.takeDownOldSpotlights(today);
    return { prompted, wished, takenDown };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async ensureCelebration(user: Celebrant, year: number): Promise<BirthdayCelebration> {
    return this.prisma.birthdayCelebration.upsert({
      where: { userId_year: { userId: user.id, year } },
      create: { userId: user.id, estateId: user.estateId, year },
      update: {},
    });
  }

  /** Creates or refreshes the spotlight entry so its message and photo match the celebration. */
  private async syncSpotlight(user: Celebrant, celebration: BirthdayCelebration, birthday: CalendarDate, today: CalendarDate) {
    const isToday = daysUntil(today, birthday) === 0;
    const description = spotlightMessage({
      firstName: user.fullName.split(' ')[0] ?? user.fullName,
      birthday: { month: birthday.month, day: birthday.day },
      isToday,
      hasParty: celebration.hasParty,
      partyAt: celebration.partyAt,
      partyVenue: celebration.partyVenue,
    });

    if (celebration.spotlightId) {
      await this.prisma.spotlight.update({
        where: { id: celebration.spotlightId },
        data: { description, active: true, imageBase64: celebration.photoBase64 },
      });
      return;
    }
    const spotlight = await this.prisma.spotlight.create({
      data: {
        estateId: user.estateId,
        name: user.fullName,
        category: 'BIRTHDAY',
        description,
        imageBase64: celebration.photoBase64,
      },
    });
    await this.prisma.birthdayCelebration.update({ where: { id: celebration.id }, data: { spotlightId: spotlight.id } });
  }

  private async otherResidents(estateId: string, exceptUserId: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { estateId, role: 'RESIDENT', active: true, id: { not: exceptUserId } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async broadcast(estateId: string, userIds: string[], message: string, type: string) {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, estateId, title: message, type })),
    });
    await this.push.sendToUsers(userIds, { title: 'MyCove', body: message, data: { type } });
  }

  private async announceParty(user: Celebrant, celebration: BirthdayCelebration, updated: boolean) {
    const message = partyAnnouncement({
      fullName: user.fullName,
      partyAt: celebration.partyAt!,
      partyVenue: celebration.partyVenue,
      updated,
    });
    await this.broadcast(user.estateId, await this.otherResidents(user.estateId, user.id), message, 'birthday_party');
    await this.prisma.birthdayCelebration.update({
      where: { id: celebration.id },
      data: { partyAnnouncedAt: new Date() },
    });
  }

  /** Birthday morning: everyone else is nudged to wish the celebrant well. */
  private async wishEstate(user: Celebrant, celebration: BirthdayCelebration) {
    const first = user.fullName.split(' ')[0] ?? user.fullName;
    const party =
      celebration.hasParty && celebration.partyAt
        ? ` Party today${celebration.partyVenue ? ` at ${celebration.partyVenue}` : ''}.`
        : '';
    await this.broadcast(
      user.estateId,
      await this.otherResidents(user.estateId, user.id),
      `🎂 It's ${first}'s birthday today — wish them a happy birthday!${party}`,
      'birthday',
    );
    await this.push.sendToUser(user.id, {
      title: `Happy birthday, ${first}! 🎉`,
      body: 'Everyone at the estate is wishing you well today.',
      data: { type: 'birthday_self' },
    });
  }

  /** A birthday spotlight stays up through the day and comes down the day after. */
  private async takeDownOldSpotlights(today: CalendarDate): Promise<number> {
    const live = await this.prisma.birthdayCelebration.findMany({
      where: { spotlight: { is: { active: true } } },
      include: { user: { select: { birthMonth: true, birthDay: true } } },
    });
    const expired = live.filter((c) => {
      if (c.user.birthMonth === null || c.user.birthDay === null) return true;
      return daysUntil(today, birthdayIn(c.year, c.user.birthMonth, c.user.birthDay)) < 0;
    });
    if (expired.length === 0) return 0;
    await this.prisma.spotlight.updateMany({
      where: { id: { in: expired.map((c) => c.spotlightId!) } },
      data: { active: false },
    });
    return expired.length;
  }

  private present(c: BirthdayCelebration) {
    return {
      id: c.id,
      year: c.year,
      hasPhoto: c.photoBase64 !== null,
      hasParty: c.hasParty,
      partyAt: c.partyAt,
      partyVenue: c.partyVenue,
      responded: c.respondedAt !== null,
    };
  }
}
