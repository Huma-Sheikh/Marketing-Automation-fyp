import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { BusinessModule } from './business/business.module';
import { CampaignModule } from './campaigns/campaign.module';
import { CallingModule } from './calling/calling.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WhitelabelModule } from './whitelabel/whitelabel.module';
import { BillingModule } from './billing/billing.module';
import { QueueModule } from './queue/queue.module';
import { PhoneNumbersModule } from './phone-numbers/phone-numbers.module';
import { User } from './database/entities/user.entity';
import { Lead } from './database/entities/lead.entity';
import { Campaign } from './database/entities/campaign.entity';
import { Call } from './database/entities/call.entity';
import { Agency } from './database/entities/agency.entity';
import { Subscription } from './database/entities/subscription.entity';
import { PhoneNumber } from './database/entities/phone-number.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [User, Lead, Campaign, Call, Agency, Subscription, PhoneNumber],
        synchronize: true,
        logging: false,

        ssl: {
          rejectUnauthorized: false,
        },

        extra: {
          family: 4,
        },
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: +config.get('REDIS_PORT', '6379'),
        },
      }),
    }),
    AiModule, AuthModule, LeadsModule, BusinessModule, CampaignModule,
    CallingModule, EmailModule, SmsModule, AnalyticsModule, WhitelabelModule, BillingModule,
    QueueModule, PhoneNumbersModule,
  ],
})
export class AppModule { }
