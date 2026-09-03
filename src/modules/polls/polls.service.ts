import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VoteDto } from './dto/vote.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { NotificationsService } from '../notifications/notifications.service';

function closesInLabel(closesAt: Date): string {
  const days = Math.ceil(
    (closesAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return 'Closed';
  if (days === 1) return 'Closes in 1 day';
  return `Closes in ${days} days`;
}

@Injectable()
export class PollsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(userId: string, estateId: string, role: string) {
    const polls = await this.prisma.poll.findMany({
      where: { estateId },
      include: { options: true, votes: true },
    });

    // Residents shouldn't see polls that closed more than 24 hours ago;
    // admins still see everything for management.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return polls
      .filter((poll) => role === 'ADMIN' || poll.closesAt > cutoff)
      .map((poll) => {
        const myVote = poll.votes.find((v) => v.userId === userId);
        const voted = myVote !== undefined;
        const votesByOption = new Map(
          poll.options.map((o) => [o.id, o.baseVotes]),
        );
        for (const v of poll.votes) {
          votesByOption.set(
            v.optionId,
            (votesByOption.get(v.optionId) ?? 0) + 1,
          );
        }
        const total = [...votesByOption.values()].reduce((a, b) => a + b, 0);

        return {
          id: poll.id,
          question: poll.question,
          closesIn: closesInLabel(poll.closesAt),
          voted,
          selectedOptionId: myVote?.optionId ?? null,
          voteCountLabel: `${total} ${total === 1 ? 'vote' : 'votes'}`,
          options: poll.options.map((o) => {
            const votes = votesByOption.get(o.id) ?? 0;
            return {
              id: o.id,
              label: o.label,
              pct: total === 0 ? 0 : Math.round((votes / total) * 100),
            };
          }),
        };
      });
  }
  async vote(userId: string, estateId: string, pollId: string, dto: VoteDto) {
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, estateId },
      include: { options: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.closesAt.getTime() <= Date.now()) {
      throw new ConflictException('This poll has closed.');
    }
    if (!poll.options.some((o) => o.id === dto.optionId)) {
      throw new NotFoundException('That option does not belong to this poll');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: { userId_pollId: { userId, pollId } },
    });
    if (existing) {
      // Active polls let residents toggle/change their response.
      await this.prisma.pollVote.update({
        where: { id: existing.id },
        data: { optionId: dto.optionId },
      });
      return { message: 'Vote updated' };
    }

    await this.prisma.pollVote.create({
      data: { userId, pollId, optionId: dto.optionId, estateId: poll.estateId },
    });
    return { message: 'Vote recorded' };
  }

  async create(estateId: string, dto: CreatePollDto) {
    const poll = await this.prisma.poll.create({
      data: {
        estateId,
        question: dto.question,
        closesAt: new Date(Date.now() + dto.closesInDays * 24 * 60 * 60 * 1000),
        options: {
          create: dto.options.map((label) => ({ label, baseVotes: 0, estateId })),
        },
      },
      include: { options: true },
    });
    await this.notifications.notifyNewPoll(estateId, dto.question);
    return poll;
  }
}
