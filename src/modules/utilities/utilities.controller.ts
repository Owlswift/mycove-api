import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import { VerifyMeterDto } from './dto/verify-meter.dto';
import { SaveMeterDto } from './dto/save-meter.dto';
import { BuyElectricityDto } from './dto/buy-electricity.dto';
import { BuyAirtimeDto } from './dto/buy-airtime.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('utilities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class UtilitiesController {
  constructor(private utilities: UtilitiesService) {}

  @Get('meters')
  listMeters(@CurrentUser() user: AuthUser) {
    return this.utilities.listMeters(user.sub, user.estateId);
  }

  @Get('discos')
  listDiscos() {
    return this.utilities.listDiscos();
  }

  @Post('meters/verify')
  verifyMeter(@Body() dto: VerifyMeterDto) {
    return this.utilities.verifyMeter(dto);
  }

  @Post('meters')
  saveMeter(@CurrentUser() user: AuthUser, @Body() dto: SaveMeterDto) {
    return this.utilities.saveMeter(user.sub, user.estateId, dto);
  }

  @Post('electricity/buy')
  buyElectricity(
    @CurrentUser() user: AuthUser,
    @Body() dto: BuyElectricityDto,
  ) {
    return this.utilities.buyElectricity(user.sub, user.estateId, dto);
  }

  @Post('airtime/buy')
  buyAirtime(@CurrentUser() user: AuthUser, @Body() dto: BuyAirtimeDto) {
    return this.utilities.buyAirtime(user.sub, user.estateId, dto);
  }

  @Get('purchases')
  listPurchases(@CurrentUser() user: AuthUser) {
    return this.utilities.listPurchases(user.sub, user.estateId);
  }
}
