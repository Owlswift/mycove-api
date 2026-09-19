import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { VisitorPassesService } from './visitor-passes.service';
import { CreateVisitorPassDto } from './dto/create-visitor-pass.dto';
import { VerifyVisitorPassDto } from './dto/verify-visitor-pass.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitorPassesController {
  constructor(private visitorPasses: VisitorPassesService) {}

  @Get('visitor-passes')
  @Roles('RESIDENT')
  list(@CurrentUser() user: AuthUser) {
    return this.visitorPasses.listForResident(user.sub, user.estateId);
  }

  @Post('visitor-passes')
  @Roles('RESIDENT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVisitorPassDto) {
    return this.visitorPasses.create(user.sub, user.estateId, dto);
  }

  /** The resident's free-token allowance today, and what an extra token would cost. */
  @Get('visitor-passes/allowance')
  @Roles('RESIDENT')
  allowance(@CurrentUser() user: AuthUser) {
    return this.visitorPasses.allowance(user.sub, user.estateId);
  }

  @Get('visitor-passes/:id')
  @Roles('RESIDENT')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.visitorPasses.getForResident(user.sub, user.estateId, id);
  }

  @Post('visitor-passes/verify')
  @Roles('GUARD')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyVisitorPassDto) {
    return this.visitorPasses.verifyByCode(user.estateId, dto.code);
  }

  @Patch('visitor-passes/:id/revoke')
  @Roles('RESIDENT')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.visitorPasses.revoke(user.sub, user.estateId, id);
  }

  @Post('visitor-passes/:id/entry')
  @Roles('GUARD')
  recordEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.visitorPasses.recordEntry(user.sub, user.estateId, id);
  }

  @Post('visitor-passes/:id/exit')
  @Roles('GUARD')
  recordExit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.visitorPasses.recordExit(user.sub, user.estateId, id);
  }

  @Get('access-log')
  @Roles('GUARD', 'ADMIN', 'CHAIRMAN')
  accessLog(@CurrentUser() user: AuthUser) {
    return this.visitorPasses.accessLog(user.estateId);
  }
}
