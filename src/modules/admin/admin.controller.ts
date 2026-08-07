import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
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
