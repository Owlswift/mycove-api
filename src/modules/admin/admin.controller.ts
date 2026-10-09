import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetStaffRolesDto } from './dto/set-staff-roles.dto';
import { SetResidentTypeDto } from './dto/set-resident-type.dto';
import { SetMoveInDto } from './dto/set-move-in.dto';
import { SetBirthdayDto } from '../birthdays/dto/set-birthday.dto';
import { SetRfidTagDto } from './dto/set-rfid-tag.dto';
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
  @Roles('ADMIN', 'CHAIRMAN')
  list(@CurrentUser() user: AuthUser) {
    return this.admin.listUsers(user.estateId);
  }

  @Get('users/:id')
  @Roles('ADMIN', 'CHAIRMAN')
  getUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.getUser(user.estateId, id);
  }

  @Patch('users/:id/move-in')
  setMoveIn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetMoveInDto) {
    return this.admin.setMoveIn(user.estateId, id, dto);
  }

  @Patch('users/:id/birthday')
  setBirthday(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetBirthdayDto) {
    return this.admin.setBirthday(user.estateId, id, dto);
  }

  @Patch('users/:id/resident-type')
  setResidentType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetResidentTypeDto,
  ) {
    return this.admin.setResidentType(user.estateId, id, dto);
  }

  @Patch('users/:id/rfid-tag')
  setRfidTag(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRfidTagDto) {
    return this.admin.setRfidTag(user.estateId, id, dto);
  }

  @Patch('users/:id/staff-roles')
  @Roles('ADMIN', 'CHAIRMAN')
  setStaffRoles(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetStaffRolesDto,
  ) {
    return this.admin.setStaffRoles(user.estateId, user.role, id, dto);
  }

  @Get('users/:id/dues-history')
  @Roles('ADMIN', 'CHAIRMAN')
  duesHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.duesHistory(user.estateId, id);
  }

  @Get('users/:id/levy-payments')
  @Roles('ADMIN', 'CHAIRMAN')
  levyPayments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.levyPayments(user.estateId, id);
  }

  @Get('users/:id/donations')
  @Roles('ADMIN', 'CHAIRMAN')
  donations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.donations(user.estateId, id);
  }

  @Get('users/:id/pledges')
  @Roles('ADMIN', 'CHAIRMAN')
  pledges(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.pledges(user.estateId, id);
  }

  @Post('users')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(user.estateId, user.role, dto);
  }

  @Post('users/:id/reset-password')
  @Roles('ADMIN', 'CHAIRMAN')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.admin.resetPassword(user.estateId, user.role, id, dto.password);
  }

  @Post('users/:id/revoke')
  @Roles('ADMIN', 'CHAIRMAN')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.setActive(user.estateId, user.role, user.sub, id, false);
  }

  @Post('users/:id/restore')
  @Roles('ADMIN', 'CHAIRMAN')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.setActive(user.estateId, user.role, user.sub, id, true);
  }
}
