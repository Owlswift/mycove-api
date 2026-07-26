import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('meetings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  list() {
    return this.meetings.list();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.get(user.sub, id);
  }

  @Post(':id/calendar')
  addToCalendar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.addToCalendar(user.sub, id);
  }
}
