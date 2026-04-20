import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { CallingModule } from '../calling/calling.module';
import { AiModule } from '../ai/ai.module';
@Module({
  imports: [TypeOrmModule.forFeature([Call, Lead, Campaign]), CallingModule, AiModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
