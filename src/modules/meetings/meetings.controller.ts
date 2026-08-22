import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('meetings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  @Roles('RESIDENT')
  list(@CurrentUser() user: AuthUser) {
    return this.meetings.list(user.estateId);
  }

  @Get(':id')
  @Roles('RESIDENT')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.get(user.sub, user.estateId, id);
  }

  @Post(':id/calendar')
  @Roles('RESIDENT')
  addToCalendar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.addToCalendar(user.sub, user.estateId, id);
  }

  @Get('admin/all')
  @Roles('ADMIN')
  adminList(@CurrentUser() user: AuthUser) {
    return this.meetings.adminList(user.estateId);
  }

  @Post('admin')
  @Roles('ADMIN')
  adminCreate(@CurrentUser() user: AuthUser, @Body() data: { title: string; date: string; time: string; location: string; agenda: string[]; report?: string }) {
    return this.meetings.adminCreate(user.estateId, data);
  }

  @Patch('admin/:id')
  @Roles('ADMIN')
  adminUpdate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() data: { title: string; date: string; time: string; location: string; agenda: string[]; report?: string }) {
    return this.meetings.adminUpdate(user.estateId, id, data);
  }

  @Delete('admin/:id')
  @Roles('ADMIN')
  adminDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.adminDelete(user.estateId, id);
  }

  @Post('admin/:id/reprocess')
  @Roles('ADMIN')
  adminReprocess(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.adminReprocess(user.estateId, id);
  }

  @Patch('admin/:id/extraction')
  @Roles('ADMIN')
  adminUpdateExtraction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() data: { topics?: string[]; decisions?: string[]; actionItems?: string[] },
  ) {
    return this.meetings.adminUpdateExtraction(user.estateId, id, data);
  }

  @Post('admin/:id/approve')
  @Roles('ADMIN')
  adminApproveExtraction(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meetings.adminApproveExtraction(user.estateId, user.sub, id);
  }
}