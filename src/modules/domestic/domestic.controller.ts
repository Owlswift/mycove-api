import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DomesticService } from './domestic.service';
import { CreateDomesticStaffDto, UpdateDomesticStaffDto } from './dto/domestic-staff.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('domestic-staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class DomesticController {
  constructor(private domestic: DomesticService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.domestic.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDomesticStaffDto) {
    return this.domestic.create(user.sub, user.estateId, dto);
  }

  /** Entries and exits of all this resident's staff, newest first. */
  @Get('log')
  log(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.domestic.log(user.sub, undefined, limit ? Number(limit) : undefined);
  }

  // Registered before ':id' so 'requests' isn't taken for an id.
  @Get('requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.domestic.pendingRequests(user.sub);
  }

  @Post('requests/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.domestic.decide(user.sub, id, true);
  }

  @Post('requests/:id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.domestic.decide(user.sub, id, false);
  }

  /** Entries and exits of one staff member. */
  @Get(':id/log')
  staffLog(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.domestic.log(user.sub, id, limit ? Number(limit) : undefined);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDomesticStaffDto) {
    return this.domestic.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.domestic.remove(user.sub, id);
  }
}
