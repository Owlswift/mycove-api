import { Controller, Get, UseGuards } from '@nestjs/common';
import { RulesService } from './rules.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESIDENT')
export class RulesController {
  constructor(private rules: RulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }
}
