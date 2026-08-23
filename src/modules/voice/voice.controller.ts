import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceLogsDto } from './dto/voice-logs.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('voice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class VoiceController {
  constructor(private voice: VoiceService) {}

  @Post('prepare')
  prepare(@CurrentUser() user: AuthUser, @Body() dto: VoiceCommandDto) {
    return this.voice.prepare(user.sub, user.estateId, dto);
  }

  /**
   * Batch upload of on-device voice-turn logs (transcript + parser decision
   * trail) for offline analysis of how residents actually use the
   * assistant. Purely a write-only analysis dataset — nothing resident-
   * facing ever reads it back.
   */
  @Post('logs')
  uploadLogs(@CurrentUser() user: AuthUser, @Body() dto: VoiceLogsDto) {
    return this.voice.uploadLogs(user.sub, user.estateId, dto);
  }
}
