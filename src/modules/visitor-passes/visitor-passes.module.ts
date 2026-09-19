import { Module } from '@nestjs/common';
import { VisitorPassesController } from './visitor-passes.controller';
import { VisitorPassesService } from './visitor-passes.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DuesModule } from '../dues/dues.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [NotificationsModule, DuesModule, WalletModule],
  controllers: [VisitorPassesController],
  providers: [VisitorPassesService],
  exports: [VisitorPassesService],
})
export class VisitorPassesModule {}
