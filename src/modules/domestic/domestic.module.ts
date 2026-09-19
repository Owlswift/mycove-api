import { Module } from '@nestjs/common';
import { DomesticController } from './domestic.controller';
import { DomesticService } from './domestic.service';
import { DuesModule } from '../dues/dues.module';
import { PushModule } from '../push/push.module';
import { VisitorPassesModule } from '../visitor-passes/visitor-passes.module';
import { WhatsappClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [DuesModule, PushModule, VisitorPassesModule, WhatsappClientModule],
  controllers: [DomesticController],
  providers: [DomesticService],
  exports: [DomesticService],
})
export class DomesticModule {}
