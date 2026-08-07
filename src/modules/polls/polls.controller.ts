import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PollsService } from './polls.service';
import { VoteDto } from './dto/vote.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('polls')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class PollsController {
  constructor(private polls: PollsService) {}

  @Get()
  @Roles('RESIDENT', 'ADMIN')
  list(@CurrentUser() user: AuthUser) {
    return this.polls.list(user.sub, user.estateId, user.role);
  }

  @Post(':id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(user.sub, user.estateId, id, dto);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePollDto) {
    return this.polls.create(user.estateId, dto);
  }
}
