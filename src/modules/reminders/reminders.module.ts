import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}