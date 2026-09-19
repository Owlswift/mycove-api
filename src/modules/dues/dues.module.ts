import { Module } from '@nestjs/common';
import { DuesController } from './dues.controller';
import { DuesService } from './dues.service';
import { DuesImportService } from './dues-import.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DuesController],
  providers: [DuesService, DuesImportService],
  exports: [DuesService, DuesImportService],
})
export class DuesModule {}
