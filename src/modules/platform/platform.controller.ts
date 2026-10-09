import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { RecordQrScanDto } from './dto/record-qr-scan.dto';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { CreateEstateDto } from './dto/create-estate.dto';
import { SetTokenChargingDto } from './dto/set-token-charging.dto';
import { CreateDiscoDto } from './dto/create-disco.dto';
import { UpdateDiscoDto } from './dto/update-disco.dto';
import { CreateWebsiteLeadDto } from './dto/create-website-lead.dto';
import { UpdateWebsiteLeadDto } from './dto/update-website-lead.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';

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

  /** Only the platform super admin can switch paid extra tokens on or off for an estate. */
  @Patch(':id/token-charging')
  setTokenCharging(@Param('id') id: string, @Body() dto: SetTokenChargingDto) {
    return this.platform.setTokenCharging(id, dto.enabled);
  }
}

@Controller('platform/users')
@UseGuards(PlatformAuthGuard)
export class PlatformUsersController {
  constructor(private platform: PlatformService) {}

  @Post('reset-password')
  resetPassword(@Body() dto: ResetUserPasswordDto) {
    return this.platform.resetUserPassword(dto);
  }

  @Post('set-role')
  setRole(@Body() dto: SetUserRoleDto) {
    return this.platform.setUserRole(dto);
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

/// Public — fired by mycove-website's /get redirect route for every QR-code
/// scan, anonymous, so no auth guard. Falls back to this request's own
/// X-Real-IP (nginx-set) only if the website didn't already pass the
/// visitor's real IP explicitly in the body — see RecordQrScanDto's comment
/// for why the explicit body field is the normal path (this is a
/// server-to-server call, so this request's own X-Real-IP is otherwise
/// just the website container's address, not the visitor's).
@Controller('platform/qr-scans')
export class PlatformQrScansPublicController {
  constructor(private platform: PlatformService) {}

  @Post()
  record(@Body() dto: RecordQrScanDto, @Headers('x-real-ip') realIp?: string) {
    return this.platform.recordQrScan({ ...dto, ip: dto.ip ?? realIp });
  }
}

@Controller('platform/qr-scans')
@UseGuards(PlatformAuthGuard)
export class PlatformQrScansController {
  constructor(private platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listQrScans();
  }

  @Get('stats')
  stats() {
    return this.platform.getQrScanStats();
  }
}
