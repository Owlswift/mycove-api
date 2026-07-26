import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PollsService } from './polls.service';
import { VoteDto } from './dto/vote.dto';
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
  list(@CurrentUser() user: AuthUser) {
    return this.polls.list(user.sub);
  }

  @Post(':id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(user.sub, id, dto);
  }
}
