import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AllocateFundsDto } from './dto/allocate-funds.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Get('summary')
  @Roles('ADMIN', 'FINANCE_SECRETARY')
  summary() {
    return this.finance.summary();
  }

  @Post('allocate')
  @Roles('FINANCE_SECRETARY')
  allocate(@CurrentUser() user: AuthUser, @Body() dto: AllocateFundsDto) {
    return this.finance.allocate(user.sub, dto);
  }

  @Get('project-budgets')
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN')
  projectBudgets() {
    return this.finance.projectBudgets();
  }

  @Get('invoices')
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN')
  listInvoices() {
    return this.finance.listInvoices();
  }

  @Post('invoices')
  @Roles('PROJECT_ADMIN')
  raiseInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.finance.raiseInvoice(user.sub, dto);
  }

  @Post('invoices/:id/approve')
  @Roles('FINANCE_SECRETARY')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.approveInvoice(user.sub, id);
  }

  @Post('invoices/:id/reject')
  @Roles('FINANCE_SECRETARY')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.rejectInvoice(user.sub, id);
  }
}
