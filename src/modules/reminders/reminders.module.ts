import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PushModule } from '../push/push.module';
import { WhatsappClientModule } from '../whatsapp/whatsapp-client.module';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [PushModule, WhatsappClientModule, CollectionsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}