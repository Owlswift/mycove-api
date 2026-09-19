import { Body, Controller, Get, Put, Post, UseGuards } from '@nestjs/common';
import { BirthdaysService } from './birthdays.service';
import { RespondBirthdayDto } from './dto/respond-birthday.dto';
import { SetBirthdayDto } from './dto/set-birthday.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('birthdays')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class BirthdaysController {
  constructor(private birthdays: BirthdaysService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.birthdays.mine(user.sub);
  }

  @Put('mine')
  setMine(@CurrentUser() user: AuthUser, @Body() dto: SetBirthdayDto) {
    return this.birthdays.setBirthday(user.sub, dto.month, dto.day);
  }

  @Post('mine/respond')
  respond(@CurrentUser() user: AuthUser, @Body() dto: RespondBirthdayDto) {
    return this.birthdays.respond(user.sub, dto);
  }
}
