import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SpotlightsService } from './spotlights.service';
import { CreateSpotlightDto } from './dto/create-spotlight.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('spotlights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpotlightsController {
  constructor(private spotlights: SpotlightsService) {}

  @Get('current')
  @Roles('RESIDENT')
  current(@CurrentUser() user: AuthUser) {
    return this.spotlights.current(user.estateId);
  }

  @Get()
  @Roles('ADMIN')
  list(@CurrentUser() user: AuthUser) {
    return this.spotlights.list(user.estateId);
  }

  @Post()
  @Roles('ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSpotlightDto) {
    return this.spotlights.create(user.estateId, dto);
  }

  @Post(':id/toggle')
  @Roles('ADMIN')
  toggle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.spotlights.toggle(user.estateId, id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.spotlights.remove(user.estateId, id);
  }
}
