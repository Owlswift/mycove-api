import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RulesService } from './rules.service';
import { CreateRulesSectionDto } from './dto/create-rules-section.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(private rules: RulesService) {}

  @Get()
  @Roles('RESIDENT')
  list(@CurrentUser() user: AuthUser) {
    return this.rules.list(user.estateId);
  }

  @Get('admin/all')
  @Roles('ADMIN')
  adminList(@CurrentUser() user: AuthUser) {
    return this.rules.adminList(user.estateId);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRulesSectionDto) {
    return this.rules.create(user.estateId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateRulesSectionDto) {
    return this.rules.update(user.estateId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rules.remove(user.estateId, id);
  }
}