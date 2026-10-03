import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { CallingModule } from '../calling/calling.module';
import { OUTREACH_QUEUES } from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Lead]),
    BullModule.registerQueue(...OUTREACH_QUEUES),
    CallingModule,
  ],
  providers: [CampaignService],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
