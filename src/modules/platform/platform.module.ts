import { Module } from '@nestjs/common';
import {
  PlatformAuthController,
  PlatformEstatesController,
  PlatformDiscosController,
} from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';

@Module({
  controllers: [
    PlatformAuthController,
    PlatformEstatesController,
    PlatformDiscosController,
  ],
  providers: [PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}
