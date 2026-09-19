import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PledgeDto } from './dto/pledge.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  @Roles('RESIDENT', 'ADMIN', 'PROJECT_ADMIN', 'CHAIRMAN')
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.estateId);
  }

  @Get('my-pledges')
  myPledges(@CurrentUser() user: AuthUser) {
    return this.projects.myPledges(user.sub);
  }

  @Get(':id')
  @Roles('RESIDENT', 'ADMIN', 'PROJECT_ADMIN', 'CHAIRMAN')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.get(id, user.sub, user.estateId);
  }

  @Post(':id/pledges')
  pledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PledgeDto,
  ) {
    return this.projects.pledge(user.sub, user.estateId, id, dto);
  }

  @Get(':id/pledges')
  @Roles('ADMIN')
  listPledges(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.listPledges(user.estateId, id);
  }

  @Post(':id/pledges/:pledgeId/remind')
  @Roles('ADMIN')
  remindPledge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('pledgeId') pledgeId: string) {
    return this.projects.remindPledge(user.estateId, id, pledgeId);
  }

  @Post(':id/pledges/:pledgeId/fulfill')
  @Roles('ADMIN')
  fulfillPledge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('pledgeId') pledgeId: string) {
    return this.projects.fulfillPledge(user.estateId, id, pledgeId);
  }

  @Post()
  @Roles('ADMIN', 'PROJECT_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.estateId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProjectDto) {
    return this.projects.update(user.estateId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.remove(user.estateId, id);
  }

  @Post(':id/progress')
  @Roles('ADMIN', 'PROJECT_ADMIN')
  updateProgress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProgressDto) {
    return this.projects.updateProgress(user.estateId, id, dto);
  }

  @Post(':id/reports')
  @Roles('ADMIN', 'PROJECT_ADMIN')
  addReport(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateReportDto) {
    return this.projects.addReport(user.estateId, id, dto);
  }
}
