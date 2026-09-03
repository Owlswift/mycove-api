import { Module } from '@nestjs/common';
import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DuesController],
  providers: [DuesService],
  exports: [DuesService],
})
export class DuesModule {}
