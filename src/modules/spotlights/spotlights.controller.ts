import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  async current(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const result = await this.spotlights.current(user.estateId);
    // Nest's default handler sends a genuinely empty body (no
    // Content-Type at all) for a bare `null`/`undefined` return value —
    // most estates have no active spotlight, so this was the common case,
    // not an edge case. Dio then hands the client a String ('') instead
    // of null for that body, and `currentSpotlight()`'s `as Map<String,
    // dynamic>?` cast throws — crashing the entire post-login resident
    // bootstrap for any such estate. Sending an explicit JSON `null`
    // (still a `Map<String, dynamic>?`-shaped contract) avoids that.
    res.status(200).json(result ?? null);
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
