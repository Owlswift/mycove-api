import { Controller, Post, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  /**
   * Manual "Send payment reminders" sweep from the admin dashboard — sends
   * dues/levy/pledge reminders to everyone currently owing in this estate,
   * exactly what the daily 8am cron would send.
   */
  @Post('send-all')
  @Roles('ADMIN', 'FINANCE_SECRETARY')
  sendAll(@CurrentUser() user: AuthUser) {
    return this.reminders.sendManualSweep(user.estateId);
  }
}