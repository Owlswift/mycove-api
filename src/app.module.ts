import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './database/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { DuesModule } from './modules/dues/dues.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { VisitorPassesModule } from './modules/visitor-passes/visitor-passes.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PollsModule } from './modules/polls/polls.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RulesModule } from './modules/rules/rules.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { PushModule } from './modules/push/push.module';
import { AdminModule } from './modules/admin/admin.module';
import { FinanceModule } from './modules/finance/finance.module';
import { SpotlightsModule } from './modules/spotlights/spotlights.module';
import { EstatesModule } from './modules/estates/estates.module';
import { UtilitiesModule } from './modules/utilities/utilities.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { VoiceModule } from './modules/voice/voice.module';
import { HouseholdModule } from './modules/household/household.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { BirthdaysModule } from './modules/birthdays/birthdays.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Powers the meeting-reminder scheduler (day-of / T-10min / started).
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AnnouncementsModule,
    MeetingsModule,
    DuesModule,
    PaymentsModule,
    VisitorPassesModule,
    ProjectsModule,
    PollsModule,
    NotificationsModule,
    RulesModule,
    ComplaintsModule,
    PushModule,
    AdminModule,
    FinanceModule,
    SpotlightsModule,
    EstatesModule,
    UtilitiesModule,
    WalletModule,
    VoiceModule,
    HouseholdModule,
    // Daily 8am dues/levy/pledge reminder cron + admin "send reminders" endpoint.
    RemindersModule,
    BirthdaysModule,
    WhatsappModule,
    PlatformModule,
  ],
})
export class AppModule {}
