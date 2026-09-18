import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EstatesService } from './estates.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';
import { UpdateStreetsDto } from './dto/update-streets.dto';
import { UpdatePassRestrictionDto } from './dto/update-pass-restriction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Deliberately unauthenticated — the mobile app calls this on its very
 * first screen, before a resident has any credentials to log in with. It
 * only confirms an estate code exists; it doesn't scope or expose any
 * estate data.
 */
@Controller('estates')
export class EstatesController {
  constructor(private estates: EstatesService) {}

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.estates.findByCode(code);
  }
}

/**
 * Authenticated sibling of [EstatesController] — serves the logged-in
 * resident app's SOS screen. Kept as a separate class so the public
 * estate-code lookup above stays guard-free exactly as before.
 *
 * NOTE: this route must stay registered BEFORE any `:code`-style param
 * route conflict matters — Nest matches by registration order per
 * controller path, and 'estates/emergency-contacts' would otherwise be
 * captured by findByCode('emergency-contacts') if they shared a class.
 */
@Controller('estates/emergency-contacts')
@UseGuards(JwtAuthGuard)
export class EstateEmergencyContactsController {
  constructor(private estates: EstatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.estates.getEmergencyContacts(user.estateId);
  }
}

@Controller('estates/admin/emergency-contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminEstateEmergencyContactsController {
  constructor(private estates: EstatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.estates.getEmergencyContacts(user.estateId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateEmergencyContactsDto) {
    return this.estates.updateEmergencyContacts(user.estateId, dto);
  }
}

/** Streets the resident picks from when completing their profile — authenticated, and registered before the `:code` catch-all like the SOS route above. */
@Controller('estates/streets')
@UseGuards(JwtAuthGuard)
export class EstateStreetsController {
  constructor(private estates: EstatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.estates.getStreets(user.estateId);
  }
}

@Controller('estates/admin/streets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminEstateStreetsController {
  constructor(private estates: EstatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.estates.getStreets(user.estateId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateStreetsDto) {
    return this.estates.updateStreets(user.estateId, dto);
  }
}

@Controller('estates/admin/pass-restriction')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminEstatePassRestrictionController {
  constructor(private estates: EstatesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.estates.getPassRestriction(user.estateId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdatePassRestrictionDto) {
    return this.estates.updatePassRestriction(user.estateId, dto);
  }
}
