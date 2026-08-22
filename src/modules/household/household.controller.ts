import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { HouseholdService } from './household.service';
import { CreateHouseholdInviteDto } from './dto/create-household-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('household')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class HouseholdController {
  constructor(private household: HouseholdService) {}

  @Get('members')
  members(@CurrentUser() user: AuthUser) {
    return this.household.members(user.sub);
  }

  @Get('invites')
  myInvites(@CurrentUser() user: AuthUser) {
    return this.household.myInvites(user.sub);
  }

  @Post('invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: CreateHouseholdInviteDto) {
    return this.household.invite(user.estateId, user.sub, dto.fullName, dto.phone);
  }

  @Delete('invite/:id')
  cancelInvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.household.cancelInvite(user.sub, id);
  }
}

@Controller('admin/household-invites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminHouseholdController {
  constructor(private household: HouseholdService) {}

  @Get()
  pending(@CurrentUser() user: AuthUser) {
    return this.household.pendingInvites(user.estateId);
  }

  @Get('members')
  members(@CurrentUser() user: AuthUser) {
    return this.household.householdMembers(user.estateId);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.household.approveInvite(user.estateId, user.sub, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.household.rejectInvite(user.estateId, user.sub, id);
  }
}
