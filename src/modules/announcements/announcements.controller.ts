import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class AnnouncementsController {
  constructor(private announcements: AnnouncementsService) {}

  @Get()
  @Roles('RESIDENT', 'ADMIN', 'CHAIRMAN')
  list(@CurrentUser() user: AuthUser) {
    return this.announcements.list(user.sub, user.estateId);
  }

  @Get(':id')
  @Roles('RESIDENT', 'ADMIN', 'CHAIRMAN')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.get(id, user.estateId);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.markRead(user.sub, user.estateId, id);
  }

  @Post()
  @Roles('ADMIN', 'CHAIRMAN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(user.estateId, dto);
  }
}
