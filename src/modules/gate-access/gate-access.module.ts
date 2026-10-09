import { Module } from '@nestjs/common';
import { GateAccessController } from './gate-access.controller';
import { GateAccessService } from './gate-access.service';
import { EstateApiKeyGuard } from './estate-api-key.guard';
import { DuesModule } from '../dues/dues.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [DuesModule, NotificationsModule, CollectionsModule],
  controllers: [GateAccessController],
  providers: [GateAccessService, EstateApiKeyGuard],
  exports: [GateAccessService],
})
export class GateAccessModule {}
