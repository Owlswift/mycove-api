import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GateAccessService } from './gate-access.service';
import { CheckAccessDto } from './dto/check-access.dto';
import { EstateApiKeyGuard } from './estate-api-key.guard';
import type { RequestWithEstate } from './estate-api-key.guard';

@Controller('gate-access')
@UseGuards(EstateApiKeyGuard)
export class GateAccessController {
  constructor(private gateAccess: GateAccessService) {}

  @Post('check')
  check(@Req() req: RequestWithEstate, @Body() dto: CheckAccessDto) {
    return this.gateAccess.checkAccess(req.estateId, dto.rfidTag);
  }
}
