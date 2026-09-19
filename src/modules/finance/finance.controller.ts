import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AllocateFundsDto } from './dto/allocate-funds.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SetDuesRateDto } from './dto/set-dues-rate.dto';
import { CreateLevyDto } from './dto/create-levy.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RecordLevyPaymentDto } from './dto/record-levy-payment.dto';
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
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'CHAIRMAN')
  summary(@CurrentUser() user: AuthUser) {
    return this.finance.summary(user.estateId);
  }

  @Post('allocate')
  @Roles('FINANCE_SECRETARY')
  allocate(@CurrentUser() user: AuthUser, @Body() dto: AllocateFundsDto) {
    return this.finance.allocate(user.estateId, user.sub, dto);
  }

  @Get('project-budgets')
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN', 'CHAIRMAN')
  projectBudgets(@CurrentUser() user: AuthUser) {
    return this.finance.projectBudgets(user.estateId);
  }

  @Get('dues')
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'CHAIRMAN')
  residentDues(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.finance.residentDues(user.estateId, year ? Number(year) : new Date().getFullYear());
  }

  @Post('dues/:residentId/record-payment')
  @Roles('ADMIN', 'FINANCE_SECRETARY')
  recordDuesPayment(
    @CurrentUser() user: AuthUser,
    @Param('residentId') residentId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.finance.recordDuesPayment(user.estateId, residentId, dto.amount, dto.note, dto.mediaBase64);
  }

  @Get('dues-rate')
  @Roles('ADMIN', 'FINANCE_SECRETARY')
  getDuesRate(@CurrentUser() user: AuthUser) {
    return this.finance.getDuesRate(user.estateId);
  }

  @Post('dues-rate')
  @Roles('FINANCE_SECRETARY')
  setDuesRate(@CurrentUser() user: AuthUser, @Body() dto: SetDuesRateDto) {
    return this.finance.setDuesRate(user.estateId, dto.monthlyAmount);
  }

  @Get('levies')
  @Roles('ADMIN', 'FINANCE_SECRETARY')
  residentLevies(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.finance.residentLevies(user.estateId, year ? Number(year) : new Date().getFullYear());
  }

  @Post('levies')
  @Roles('FINANCE_SECRETARY')
  createLevy(@CurrentUser() user: AuthUser, @Body() dto: CreateLevyDto) {
    return this.finance.createLevy(user.estateId, dto);
  }

  @Delete('levies/:id')
  @Roles('FINANCE_SECRETARY')
  deleteLevy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.deleteLevy(user.estateId, id);
  }

  @Post('levies/:levyId/residents/:residentId/record-payment')
  @Roles('FINANCE_SECRETARY')
  recordLevyPayment(
    @CurrentUser() user: AuthUser,
    @Param('levyId') levyId: string,
    @Param('residentId') residentId: string,
    @Body() dto: RecordLevyPaymentDto,
  ) {
    return this.finance.recordLevyPayment(user.estateId, residentId, levyId, dto.mediaBase64);
  }

  @Get('invoices')
  @Roles('ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN', 'CHAIRMAN')
  listInvoices(@CurrentUser() user: AuthUser) {
    return this.finance.listInvoices(user.estateId);
  }

  @Post('invoices')
  @Roles('PROJECT_ADMIN')
  raiseInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.finance.raiseInvoice(user.estateId, user.sub, dto);
  }

  @Post('invoices/:id/approve')
  @Roles('FINANCE_SECRETARY')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.approveInvoice(user.estateId, user.sub, id);
  }

  @Post('invoices/:id/reject')
  @Roles('FINANCE_SECRETARY')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.rejectInvoice(user.estateId, user.sub, id);
  }
}
