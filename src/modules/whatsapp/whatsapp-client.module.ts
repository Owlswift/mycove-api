import { Module } from '@nestjs/common';
import { WhatsappClient } from './whatsapp-client';

@Module({ providers: [WhatsappClient], exports: [WhatsappClient] })
export class WhatsappClientModule {}
