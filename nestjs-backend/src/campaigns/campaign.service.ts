import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { CallingService } from '../calling/calling.service';
import { EmailJobData, SmsJobData } from '../queue/outreach.processor';

const DEFAULT_EMAIL_SUBJECT = 'Quick question about your business';
const DEFAULT_EMAIL_TEMPLATE = 'Hi {{firstName}}, I wanted to reach out...';
const DEFAULT_SMS_TEMPLATE = 'Hi {{firstName}}, this is a quick message from us.';

const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: true };

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('sms') private smsQueue: Queue,
    private callingService: CallingService,
  ) {}

  async createCampaign(userId: string, dto: { name: string; type: string; settings?: any }) {
    const c = this.campaignRepo.create({
      userId, name: dto.name, type: dto.type, status: 'draft', settings: dto.settings || {},
    });
    return this.campaignRepo.save(c);
  }

  /**
   * Leads this campaign should target.
   *
   * `settings.leadIds` lets a campaign address a specific segment. Without it we
   * fall back to every unworked lead — the original behaviour, kept so existing
   * campaigns keep running, but it means two campaigns share one pool, so the
   * UI should always send an explicit selection.
   */
  private async resolveTargetLeads(userId: string, settings: any): Promise<Lead[]> {
    const leadIds: string[] = Array.isArray(settings?.leadIds) ? settings.leadIds : [];
    if (leadIds.length) {
      return this.leadRepo.find({ where: { id: In(leadIds), userId } });
    }
    return this.leadRepo.find({ where: { userId, status: 'new' } });
  }

  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId, userId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === 'running') return { message: 'Already running' };

    const settings = (campaign.settings as any) || {};
    const leads = await this.resolveTargetLeads(userId, settings);
    if (!leads.length) throw new NotFoundException('No leads available for this campaign');

    const wantsCalls = campaign.type === 'call' || campaign.type === 'mixed';
    if (wantsCalls && settings.phoneNumberId) {
      await this.callingService.assertCallerNumberUsable(userId, settings.phoneNumberId);
    }

    await this.campaignRepo.update(campaignId, { status: 'running', totalLeads: leads.length });

    const results: any = {};
    const wants = (channel: string) => campaign.type === channel || campaign.type === 'mixed';

    if (wants('call')) {
      results.calling = await this.callingService.startCampaignCalls(
        campaignId, userId, leads.filter(l => l.phone), settings,
      );
    }
    if (wants('email')) {
      results.email = await this.queueEmails(campaignId, leads, settings);
    }
    if (wants('sms')) {
      results.sms = await this.queueSms(campaignId, leads, settings);
    }

    this.logger.log(`Campaign ${campaignId} started against ${leads.length} leads`);
    return { message: 'Campaign started', campaignId, totalLeads: leads.length, results };
  }

  private async queueEmails(campaignId: string, leads: Lead[], settings: any) {
    const targets = leads.filter(l => l.email);
    const jobs = targets.map(lead => ({
      name: 'send-email',
      data: {
        lead,
        campaignId,
        subject: settings?.emailSubject || DEFAULT_EMAIL_SUBJECT,
        template: settings?.emailTemplate || DEFAULT_EMAIL_TEMPLATE,
      } as EmailJobData,
      opts: JOB_OPTS,
    }));
    if (jobs.length) await this.emailQueue.addBulk(jobs);
    return { queued: jobs.length, skipped: leads.length - targets.length };
  }

  private async queueSms(campaignId: string, leads: Lead[], settings: any) {
    const targets = leads.filter(l => l.phone);
    const jobs = targets.map(lead => ({
      name: 'send-sms',
      data: {
        lead,
        campaignId,
        template: settings?.smsTemplate || DEFAULT_SMS_TEMPLATE,
      } as SmsJobData,
      opts: JOB_OPTS,
    }));
    if (jobs.length) await this.smsQueue.addBulk(jobs);
    return { queued: jobs.length, skipped: leads.length - targets.length };
  }

  // As with leads, every campaign lookup is scoped by userId so one tenant cannot
  // stop, inspect or delete another tenant's campaign by guessing its UUID.
  async stopCampaign(campaignId: string, userId: string) {
    const result = await this.campaignRepo.update({ id: campaignId, userId }, { status: 'paused' });
    if (!result.affected) throw new NotFoundException('Campaign not found');

    await this.callingService.stopCampaign(campaignId);
    await this.removeQueuedOutreach(campaignId);
    return { message: 'Campaign stopped' };
  }

  /** Drop this campaign's pending email/SMS jobs without touching other tenants'. */
  private async removeQueuedOutreach(campaignId: string) {
    for (const queue of [this.emailQueue, this.smsQueue]) {
      const jobs = await queue.getJobs(['waiting', 'delayed']);
      for (const job of jobs) {
        if (job.data?.campaignId === campaignId) await job.remove();
      }
    }
  }

  async getCampaigns(userId: string) {
    return this.campaignRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async getCampaignStats(campaignId: string, userId: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId, userId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return { campaign, activeCalls: this.callingService.getActiveCallCount() };
  }

  async deleteCampaign(campaignId: string, userId: string) {
    const result = await this.campaignRepo.delete({ id: campaignId, userId });
    if (!result.affected) throw new NotFoundException('Campaign not found');
    return { deleted: true };
  }
}
