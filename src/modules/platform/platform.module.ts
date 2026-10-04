import { Module } from '@nestjs/common';
import {
  PlatformAuthController,
  PlatformEstatesController,
  PlatformDiscosController,
  PlatformLeadsController,
  PlatformLeadsPublicController,
  PlatformUsersController,
} from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';

@Module({
  controllers: [
    PlatformAuthController,
    PlatformEstatesController,
    PlatformDiscosController,
    PlatformLeadsPublicController,
    PlatformLeadsController,
    PlatformUsersController,
  ],
  providers: [PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}
