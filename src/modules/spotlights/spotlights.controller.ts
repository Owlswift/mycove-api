import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SpotlightsService } from './spotlights.service';
import { CreateSpotlightDto } from './dto/create-spotlight.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('spotlights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpotlightsController {
  constructor(private spotlights: SpotlightsService) {}

  @Get('current')
  @Roles('RESIDENT')
  current() {
    return this.spotlights.current();
  }

  @Get()
  @Roles('ADMIN')
  list() {
    return this.spotlights.list();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateSpotlightDto) {
    return this.spotlights.create(dto);
  }

  @Post(':id/toggle')
  @Roles('ADMIN')
  toggle(@Param('id') id: string) {
    return this.spotlights.toggle(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.spotlights.remove(id);
  }
}
