import { Controller, Get, Param } from '@nestjs/common';
import { EstatesService } from './estates.service';

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
