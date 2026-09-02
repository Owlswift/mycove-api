import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { MockPaystackGateway } from './gateway/mock-paystack.gateway';
import { PaystackGateway } from './gateway/paystack.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [NotificationsModule, WalletModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    MockPaystackGateway,
    PaystackGateway,
    {
      provide: PAYMENT_GATEWAY,
      // Local dev without Paystack keys keeps working exactly as before —
      // only swaps to the real gateway once PAYSTACK_SECRET_KEY is set.
      useFactory: (real: PaystackGateway, mock: MockPaystackGateway) =>
        real.configured ? real : mock,
      inject: [PaystackGateway, MockPaystackGateway],
    },
  ],
})
export class PaymentsModule {}
