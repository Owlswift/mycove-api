import { Module } from '@nestjs/common';
import { OllamaClientService } from './ollama-client.service';
import { CollectionsIntelligenceService } from './collections-intelligence.service';

@Module({
  providers: [OllamaClientService, CollectionsIntelligenceService],
  exports: [CollectionsIntelligenceService],
})
export class CollectionsModule {}
