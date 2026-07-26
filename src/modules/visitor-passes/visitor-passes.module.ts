import { Module } from '@nestjs/common';
import { VisitorPassesController } from './visitor-passes.controller';
import { VisitorPassesService } from './visitor-passes.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [VisitorPassesController],
  providers: [VisitorPassesService],
})
export class VisitorPassesModule {}
