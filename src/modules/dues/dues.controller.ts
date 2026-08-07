import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DuesService } from './dues.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class DuesController {
  constructor(private dues: DuesService) {}

  @Get('dues')
  getDues(@CurrentUser() user: AuthUser) {
    return this.dues.getDues(user.sub);
  }

  @Get('levies')
  listLevies(@CurrentUser() user: AuthUser) {
    return this.dues.listLevies(user.sub, user.estateId);
  }

  @Post('levies/:id/pay')
  payLevy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dues.payLevy(user.sub, user.estateId, id);
  }
}
