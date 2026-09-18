import { Module } from '@nestjs/common';
import {
  AdminEstateEmergencyContactsController,
  AdminEstatePassRestrictionController,
  AdminEstateStreetsController,
  EstateEmergencyContactsController,
  EstateStreetsController,
  EstatesController,
} from './estates.controller';
import { EstatesService } from './estates.service';

@Module({
  controllers: [
    // Emergency-contact routes register before the catch-all ':code'
    // lookup — see the note on EstateEmergencyContactsController.
    EstateEmergencyContactsController,
    AdminEstateEmergencyContactsController,
    EstateStreetsController,
    AdminEstateStreetsController,
    AdminEstatePassRestrictionController,
    EstatesController,
  ],
  providers: [EstatesService],
})
export class EstatesModule {}
