import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PUSH_GATEWAY } from './gateway/push-gateway.interface';
import { FirebasePushGateway } from './gateway/firebase-push.gateway';

@Module({
  controllers: [PushController],
  providers: [
    PushService,
    FirebasePushGateway,
    { provide: PUSH_GATEWAY, useClass: FirebasePushGateway },
  ],
  exports: [PushService],
})
export class PushModule {}
