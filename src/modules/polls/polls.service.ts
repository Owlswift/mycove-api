import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { VoteDto } from './dto/vote.dto';

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
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const polls = await this.prisma.poll.findMany({
      include: { options: true, votes: { where: { userId } } },
    });

    return polls.map((poll) => {
      const myVote = poll.votes[0];
      const voted = !!myVote;
      const votesByOption = new Map(
        poll.options.map((o) => [o.id, o.baseVotes]),
      );
      if (voted)
        votesByOption.set(
          myVote.optionId,
          (votesByOption.get(myVote.optionId) ?? 0) + 1,
        );
      const total = [...votesByOption.values()].reduce((a, b) => a + b, 0);

      return {
        id: poll.id,
        question: poll.question,
        closesIn: closesInLabel(poll.closesAt),
        voted,
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

  async vote(userId: string, pollId: string, dto: VoteDto) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (!poll.options.some((o) => o.id === dto.optionId)) {
      throw new NotFoundException('That option does not belong to this poll');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: { userId_pollId: { userId, pollId } },
    });
    if (existing)
      throw new ConflictException('You have already voted in this poll.');

    await this.prisma.pollVote.create({
      data: { userId, pollId, optionId: dto.optionId },
    });
    return { message: 'Vote recorded' };
  }
}
