import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsService } from './analytics/analytics.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [AnalyticsService, JwtAuthGuard, RolesGuard],
  exports: [AnalyticsService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class CommonModule {}
