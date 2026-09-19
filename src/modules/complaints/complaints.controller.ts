import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('complaints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplaintsController {
  constructor(private complaints: ComplaintsService) {}

  @Get()
  @Roles('RESIDENT')
  list(@CurrentUser() user: AuthUser) {
    return this.complaints.list(user.sub);
  }

  @Post()
  @Roles('RESIDENT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user.sub, user.estateId, dto);
  }

  @Get('admin/all')
  @Roles('ADMIN', 'CHAIRMAN')
  adminList(@CurrentUser() user: AuthUser) {
    return this.complaints.adminList(user.estateId);
  }

  @Patch('admin/:id/status')
  @Roles('ADMIN')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateComplaintStatusDto) {
    return this.complaints.updateStatus(user.estateId, id, dto.status);
  }
}