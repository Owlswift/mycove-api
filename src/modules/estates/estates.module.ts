import { Module } from '@nestjs/common';
import { EstatesController } from './estates.controller';
import { EstatesService } from './estates.service';

@Module({
  controllers: [EstatesController],
  providers: [EstatesService],
})
export class EstatesModule {}
