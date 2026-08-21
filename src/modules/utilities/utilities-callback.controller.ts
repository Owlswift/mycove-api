import { Body, Controller, Post } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import type { VtpassCallbackPayload } from './utilities.service';

/**
 * VTpass calls this directly from their servers to resolve a transaction
 * that came back "still processing" (code 099) on the original /pay call —
 * it is NOT reachable through UtilitiesController's JwtAuthGuard, since
 * VTpass has no session token for us. Kept as a separate controller rather
 * than a @Public()-style bypass because no such bypass decorator exists
 * anywhere else in this codebase yet, and one endpoint doesn't justify
 * introducing that machinery.
 */
@Controller('utilities/callback')
export class UtilitiesCallbackController {
  constructor(private utilities: UtilitiesService) {}

  @Post('vtpass')
  handleVtpassCallback(@Body() body: VtpassCallbackPayload) {
    return this.utilities.handleVtpassCallback(body);
  }
}
