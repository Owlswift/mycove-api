import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PushService } from './push.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private push: PushService) {}

  @Post('register-token')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.push.registerToken(user.sub, dto.token, dto.platform);
  }

  @Post('unregister-token')
  unregister(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.push.unregisterToken(user.sub, dto.token);
  }
}
