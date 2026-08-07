import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post('initiate')
  initiate(@CurrentUser() user: AuthUser, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(user.sub, user.estateId, dto);
  }

  @Get('verify/:reference')
  verify(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.payments.verify(user.sub, reference);
  }

  @Get(':reference/receipt')
  receipt(
    @CurrentUser() user: AuthUser,
    @Param('reference') reference: string,
  ) {
    return this.payments.receipt(user.sub, reference);
  }
}
