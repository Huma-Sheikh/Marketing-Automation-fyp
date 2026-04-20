import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { CallingService } from '../calling/calling.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  constructor(
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    private callingService: CallingService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  async createCampaign(userId: string, dto: { name: string; type: string; settings?: any }) {
    const c = this.campaignRepo.create({ userId, name: dto.name, type: dto.type, status: 'draft', settings: dto.settings || {} });
    return this.campaignRepo.save(c);
  }

  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId, userId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === 'running') return { message: 'Already running' };

    const leads = await this.leadRepo.find({ where: { userId, status: 'new' } });
    if (!leads.length) throw new NotFoundException('No new leads available');

    await this.campaignRepo.update(campaignId, { status: 'running', totalLeads: leads.length });

    const settings = campaign.settings as any;
    const results: any = {};

    if (campaign.type === 'call' || campaign.type === 'mixed') {
      results.calling = await this.callingService.startCampaignCalls(campaignId, leads.filter(l => l.phone), settings);
    }
    if (campaign.type === 'email' || campaign.type === 'mixed') {
      results.email = await this.emailService.sendBulkEmails(
        leads.filter(l => l.email),
        settings?.emailSubject || 'Quick question about your business',
        settings?.emailTemplate || 'Hi {{firstName}}, I wanted to reach out...',
      );
    }
    if (campaign.type === 'sms' || campaign.type === 'mixed') {
      results.sms = await this.smsService.sendBulkSms(
        leads.filter(l => l.phone),
        settings?.smsTemplate || 'Hi {{firstName}}, this is a quick message from us.',
      );
    }
    this.logger.log(`Campaign ${campaignId} started`);
    return { message: 'Campaign started', campaignId, results };
  }

  async stopCampaign(campaignId: string) {
    await this.campaignRepo.update(campaignId, { status: 'paused' });
    await this.callingService.stopCampaign(campaignId);
    return { message: 'Campaign stopped' };
  }

  async getCampaigns(userId: string) {
    return this.campaignRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async getCampaignStats(campaignId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    return { campaign, activeCalls: this.callingService.getActiveCallCount() };
  }

  async deleteCampaign(campaignId: string) {
    await this.campaignRepo.delete(campaignId);
    return { deleted: true };
  }
}
