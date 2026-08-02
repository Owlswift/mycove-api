import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('users')
  list() {
    return this.admin.listUsers();
  }

  @Post('users')
  create(@Body() dto: CreateUserDto) {
    return this.admin.createUser(dto);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.admin.resetPassword(id, dto.password);
  }
}
