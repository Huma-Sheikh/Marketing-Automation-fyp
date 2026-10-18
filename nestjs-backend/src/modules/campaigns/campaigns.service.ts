import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Campaign } from '../../database/entities/campaign.entity';
import { Lead } from '../../database/entities/lead.entity';
import { CallingService } from '../calling/calling.service';
import { JOBS, OUTREACH_JOB_OPTS, QUEUES } from '../queue/queue.constants';
import { EmailJobData, SmsJobData } from '../queue/queue.types';
import { CampaignChannel, CampaignSettings, usesChannel } from './campaign.types';
import { CreateCampaignDto } from './dto/create-campaign.dto';

const DEFAULT_EMAIL_SUBJECT = 'Quick question about your business';
const DEFAULT_EMAIL_TEMPLATE = 'Hi {{firstName}}, I wanted to reach out...';
const DEFAULT_SMS_TEMPLATE = 'Hi {{firstName}}, this is a quick message from us.';

/**
 * Campaign lifecycle: create, start (fan out to the calling/email/SMS queues),
 * stop, inspect and delete. Every query is scoped to the owning user.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectQueue(QUEUES.email) private emailQueue: Queue,
    @InjectQueue(QUEUES.sms) private smsQueue: Queue,
    private callingService: CallingService,
  ) {}

  async createCampaign(userId: string, dto: CreateCampaignDto) {
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
  private async resolveTargetLeads(userId: string, settings: CampaignSettings): Promise<Lead[]> {
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

    const settings = (campaign.settings as CampaignSettings) || {};
    const leads = await this.resolveTargetLeads(userId, settings);
    if (!leads.length) throw new NotFoundException('No leads available for this campaign');

    const wants = (channel: CampaignChannel) => usesChannel(campaign.type, channel);
    if (wants('call') && settings.phoneNumberId) {
      await this.callingService.assertCallerNumberUsable(userId, settings.phoneNumberId);
    }

    await this.campaignRepo.update(campaignId, { status: 'running', totalLeads: leads.length });

    const results: Record<string, unknown> = {};

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

  private async queueEmails(campaignId: string, leads: Lead[], settings: CampaignSettings) {
    const targets = leads.filter(l => l.email);
    const jobs = targets.map(lead => ({
      name: JOBS.sendEmail,
      data: {
        lead,
        campaignId,
        subject: settings?.emailSubject || DEFAULT_EMAIL_SUBJECT,
        template: settings?.emailTemplate || DEFAULT_EMAIL_TEMPLATE,
      } as EmailJobData,
      opts: OUTREACH_JOB_OPTS,
    }));
    if (jobs.length) await this.emailQueue.addBulk(jobs);
    return { queued: jobs.length, skipped: leads.length - targets.length };
  }

  private async queueSms(campaignId: string, leads: Lead[], settings: CampaignSettings) {
    const targets = leads.filter(l => l.phone);
    const jobs = targets.map(lead => ({
      name: JOBS.sendSms,
      data: {
        lead,
        campaignId,
        template: settings?.smsTemplate || DEFAULT_SMS_TEMPLATE,
      } as SmsJobData,
      opts: OUTREACH_JOB_OPTS,
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
