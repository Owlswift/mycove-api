import { Module } from '@nestjs/common';
import { BirthdaysController } from './birthdays.controller';
import { BirthdaysService } from './birthdays.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [BirthdaysController],
  providers: [BirthdaysService],
  exports: [BirthdaysService],
})
export class BirthdaysModule {}
