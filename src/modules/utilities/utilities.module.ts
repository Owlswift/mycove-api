import { Module } from '@nestjs/common';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesCallbackController } from './utilities-callback.controller';
import { UtilitiesService } from './utilities.service';
import { VtpassProvider } from './providers/vtpass.provider';
import { BuypowerProvider } from './providers/buypower.provider';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [UtilitiesController, UtilitiesCallbackController],
  providers: [UtilitiesService, VtpassProvider, BuypowerProvider],
})
export class UtilitiesModule {}
