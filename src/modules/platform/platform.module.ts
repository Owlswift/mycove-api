import { Module } from '@nestjs/common';
import {
  PlatformAuthController,
  PlatformEstatesController,
  PlatformDiscosController,
  PlatformLeadsController,
  PlatformLeadsPublicController,
  PlatformQrScansController,
  PlatformQrScansPublicController,
  PlatformUsersController,
} from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [
    PlatformAuthController,
    PlatformEstatesController,
    PlatformDiscosController,
    PlatformLeadsPublicController,
    PlatformLeadsController,
    PlatformQrScansPublicController,
    PlatformQrScansController,
    PlatformUsersController,
  ],
  providers: [PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}
