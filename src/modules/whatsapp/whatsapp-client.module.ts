import { Module } from '@nestjs/common';
import { WhatsappClient } from './whatsapp-client';
import { WhatsappNotifier } from './whatsapp-notifier';

@Module({ providers: [WhatsappClient, WhatsappNotifier], exports: [WhatsappClient, WhatsappNotifier] })
export class WhatsappClientModule {}
