import { Controller, Get, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthUser) {
    const balance = await this.wallet.getBalance(user.sub, user.estateId);
    return { balance };
  }

  @Get('transactions')
  transactions(@CurrentUser() user: AuthUser) {
    return this.wallet.listTransactions(user.sub, user.estateId);
  }
}
