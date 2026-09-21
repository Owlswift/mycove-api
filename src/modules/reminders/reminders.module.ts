import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PushModule } from '../push/push.module';
import { WhatsappClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [PushModule, WhatsappClientModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}