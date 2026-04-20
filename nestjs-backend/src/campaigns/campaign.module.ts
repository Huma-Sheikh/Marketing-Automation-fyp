import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { CallingModule } from '../calling/calling.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
@Module({
  imports: [TypeOrmModule.forFeature([Campaign, Lead]), CallingModule, EmailModule, SmsModule],
  providers: [CampaignService],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
