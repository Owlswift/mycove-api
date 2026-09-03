import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { DuesModule } from '../dues/dues.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DuesModule, NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
