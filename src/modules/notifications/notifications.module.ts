import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushModule } from '../push/push.module';
import { WhatsappClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [PushModule, WhatsappClientModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
