import { Module } from '@nestjs/common';
import { SpotlightsController } from './spotlights.controller';
import { SpotlightsService } from './spotlights.service';

@Module({
  controllers: [SpotlightsController],
  providers: [SpotlightsService],
})
export class SpotlightsModule {}
