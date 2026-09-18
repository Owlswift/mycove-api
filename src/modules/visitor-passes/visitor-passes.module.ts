import { Module } from '@nestjs/common';
import { VisitorPassesController } from './visitor-passes.controller';
import { VisitorPassesService } from './visitor-passes.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DuesModule } from '../dues/dues.module';

@Module({
  imports: [NotificationsModule, DuesModule],
  controllers: [VisitorPassesController],
  providers: [VisitorPassesService],
})
export class VisitorPassesModule {}
