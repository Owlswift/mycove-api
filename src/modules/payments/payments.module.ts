import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { MockPaystackGateway } from './gateway/mock-paystack.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaystackGateway,
    { provide: PAYMENT_GATEWAY, useClass: MockPaystackGateway },
  ],
})
export class PaymentsModule {}
