import { Module } from '@nestjs/common';
import {
  AdminEstateEmergencyContactsController,
  EstateEmergencyContactsController,
  EstatesController,
} from './estates.controller';
import { EstatesService } from './estates.service';

@Module({
  controllers: [
    // Emergency-contact routes register before the catch-all ':code'
    // lookup — see the note on EstateEmergencyContactsController.
    EstateEmergencyContactsController,
    AdminEstateEmergencyContactsController,
    EstatesController,
  ],
  providers: [EstatesService],
})
export class EstatesModule {}
