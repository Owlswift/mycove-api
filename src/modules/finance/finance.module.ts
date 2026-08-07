import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { DuesModule } from '../dues/dues.module';

@Module({
  imports: [DuesModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
