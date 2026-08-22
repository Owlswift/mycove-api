import { Module } from '@nestjs/common';
import { HouseholdController, AdminHouseholdController } from './household.controller';
import { HouseholdService } from './household.service';

@Module({
  controllers: [HouseholdController, AdminHouseholdController],
  providers: [HouseholdService],
})
export class HouseholdModule {}
