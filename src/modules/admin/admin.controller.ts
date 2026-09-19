import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetStaffRolesDto } from './dto/set-staff-roles.dto';
import { SetResidentTypeDto } from './dto/set-resident-type.dto';
import { SetMoveInDto } from './dto/set-move-in.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('users')
  list(@CurrentUser() user: AuthUser) {
    return this.admin.listUsers(user.estateId);
  }

  @Get('users/:id')
  getUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.getUser(user.estateId, id);
  }

  @Patch('users/:id/move-in')
  setMoveIn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetMoveInDto) {
    return this.admin.setMoveIn(user.estateId, id, dto);
  }

  @Patch('users/:id/resident-type')
  setResidentType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetResidentTypeDto,
  ) {
    return this.admin.setResidentType(user.estateId, id, dto);
  }

  @Patch('users/:id/staff-roles')
  setStaffRoles(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetStaffRolesDto,
  ) {
    return this.admin.setStaffRoles(user.estateId, id, dto);
  }

  @Get('users/:id/dues-history')
  duesHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.duesHistory(user.estateId, id);
  }

  @Get('users/:id/levy-payments')
  levyPayments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.levyPayments(user.estateId, id);
  }

  @Get('users/:id/donations')
  donations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.donations(user.estateId, id);
  }

  @Get('users/:id/pledges')
  pledges(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.pledges(user.estateId, id);
  }

  @Post('users')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(user.estateId, dto);
  }

  @Post('users/:id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.admin.resetPassword(user.estateId, id, dto.password);
  }

  @Post('users/:id/revoke')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.setActive(user.estateId, user.sub, id, false);
  }

  @Post('users/:id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.setActive(user.estateId, user.sub, id, true);
  }
}
