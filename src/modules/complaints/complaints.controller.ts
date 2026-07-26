import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('complaints')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class ComplaintsController {
  constructor(private complaints: ComplaintsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.complaints.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user.sub, dto);
  }
}
