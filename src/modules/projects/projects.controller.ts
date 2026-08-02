import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
  @Roles('RESIDENT', 'ADMIN')
  list() {
    return this.projects.list();
  }

  @Get('my-pledges')
  myPledges(@CurrentUser() user: AuthUser) {
    return this.projects.myPledges(user.sub);
  }

  @Get(':id')
  @Roles('RESIDENT', 'ADMIN')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.get(id, user.sub);
  }

  @Post(':id/pledges')
  pledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PledgeDto,
  ) {
    return this.projects.pledge(user.sub, id, dto);
  }

  @Get(':id/pledges')
  @Roles('ADMIN')
  listPledges(@Param('id') id: string) {
    return this.projects.listPledges(id);
  }

  @Post(':id/pledges/:pledgeId/remind')
  @Roles('ADMIN')
  remindPledge(@Param('id') id: string, @Param('pledgeId') pledgeId: string) {
    return this.projects.remindPledge(id, pledgeId);
  }

  @Post(':id/pledges/:pledgeId/fulfill')
  @Roles('ADMIN')
  fulfillPledge(@Param('id') id: string, @Param('pledgeId') pledgeId: string) {
    return this.projects.fulfillPledge(id, pledgeId);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Post(':id/progress')
  @Roles('ADMIN')
  updateProgress(@Param('id') id: string, @Body() dto: UpdateProgressDto) {
    return this.projects.updateProgress(id, dto);
  }

  @Post(':id/reports')
  @Roles('ADMIN')
  addReport(@Param('id') id: string, @Body() dto: CreateReportDto) {
    return this.projects.addReport(id, dto);
  }
}
