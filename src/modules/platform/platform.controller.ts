import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { CreateEstateDto } from './dto/create-estate.dto';
import { CreateDiscoDto } from './dto/create-disco.dto';
import { UpdateDiscoDto } from './dto/update-disco.dto';
import { CreateWebsiteLeadDto } from './dto/create-website-lead.dto';
import { UpdateWebsiteLeadDto } from './dto/update-website-lead.dto';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private platform: PlatformService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platform.login(dto);
  }
}

@Controller('platform/estates')
@UseGuards(PlatformAuthGuard)
export class PlatformEstatesController {
  constructor(private platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listEstates();
  }

  @Post()
  create(@Body() dto: CreateEstateDto) {
    return this.platform.createEstate(dto);
  }
}

@Controller('platform/discos')
@UseGuards(PlatformAuthGuard)
export class PlatformDiscosController {
  constructor(private platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listDiscos();
  }

  @Post()
  create(@Body() dto: CreateDiscoDto) {
    return this.platform.createDisco(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDiscoDto) {
    return this.platform.updateDisco(id, dto);
  }
}

/// Public — submitted by anonymous visitors on the marketing site
/// (mycove-website), not platform admins, so no auth guard here.
@Controller('platform/leads')
export class PlatformLeadsPublicController {
  constructor(private platform: PlatformService) {}

  @Post()
  create(@Body() dto: CreateWebsiteLeadDto) {
    return this.platform.createLead(dto);
  }
}

@Controller('platform/leads')
@UseGuards(PlatformAuthGuard)
export class PlatformLeadsController {
  constructor(private platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listLeads();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebsiteLeadDto) {
    return this.platform.updateLead(id, dto);
  }
}
