import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BusinessModule } from './modules/business/business.module';
import { CallingModule } from './modules/calling/calling.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PhoneNumbersModule } from './modules/phone-numbers/phone-numbers.module';
import { QueueModule } from './modules/queue/queue.module';
import { SmsModule } from './modules/sms/sms.module';
import { WhitelabelModule } from './modules/whitelabel/whitelabel.module';

@Module({
  imports: [
    // Validated once at boot; every module reads values through ConfigService.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // Platform
    HealthModule,
    AuthModule,
    BillingModule,
    WhitelabelModule,

    // Lead generation
    AiModule,
    LeadsModule,
    BusinessModule,

    // Outreach
    CampaignsModule,
    CallingModule,
    PhoneNumbersModule,
    EmailModule,
    SmsModule,
    QueueModule,

    AnalyticsModule,
  ],
})
export class AppModule {}
