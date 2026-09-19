import { Module } from '@nestjs/common';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { DomesticModule } from '../domestic/domestic.module';

@Module({ imports: [DomesticModule], controllers: [WhatsappWebhookController] })
export class WhatsappModule {}
