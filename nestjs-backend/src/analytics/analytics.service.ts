import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { CallingService } from '../calling/calling.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Call) private callRepo: Repository<Call>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    private callingService: CallingService,
    private aiService: AiService,
  ) {}

  async getDashboardStats(userId: string) {
    const [callStats, leadStats, campaignStats, aiHealth] = await Promise.all([
      this.getCallStats(userId),
      this.getLeadStats(userId),
      this.getCampaignStats(userId),
      this.aiService.checkHealth(),
    ]);
    return { activeCalls: this.callingService.getActiveCallCount(), calls: callStats, leads: leadStats, campaigns: campaignStats, aiHealth, generatedAt: new Date().toISOString() };
  }

  private async getCallStats(userId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const base = () => this.callRepo.createQueryBuilder('c')
      .innerJoin('c.campaign', 'camp')
      .where('camp.userId = :userId', { userId });

    const [today, week, month, total, completed] = await Promise.all([
      base().andWhere('c.createdAt >= :d', { d: todayStart }).getCount(),
      base().andWhere('c.createdAt >= :d', { d: weekStart }).getCount(),
      base().andWhere('c.createdAt >= :d', { d: monthStart }).getCount(),
      base().getCount(),
      base().andWhere('c.status = :s', { s: 'completed' }).getCount(),
    ]);

    const avgRaw = await base().andWhere('c.status = :s', { s: 'completed' })
      .select('AVG(c.durationSeconds)', 'avg').getRawOne();
    const avgDuration = Math.round(avgRaw?.avg || 0);

    const outcomes = await base().andWhere('c.outcome IS NOT NULL')
      .select('c.outcome', 'outcome').addSelect('COUNT(*)', 'count')
      .groupBy('c.outcome').getRawMany();

    return { today, week, month, total, completed, avgDurationSeconds: avgDuration, outcomes };
  }

  private async getLeadStats(userId: string) {
    const base = () => this.leadRepo.createQueryBuilder('l').where('l.userId = :userId', { userId });
    const [total, newLeads, contacted, qualified, converted] = await Promise.all([
      base().getCount(),
      base().andWhere('l.status = :s', { s: 'new' }).getCount(),
      base().andWhere('l.status = :s', { s: 'contacted' }).getCount(),
      base().andWhere('l.status = :s', { s: 'qualified' }).getCount(),
      base().andWhere('l.status = :s', { s: 'converted' }).getCount(),
    ]);
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0';
    const byPlatform = await base()
      .select('l.sourceplatform', 'platform').addSelect('COUNT(*)', 'count')
      .groupBy('l.sourceplatform').getRawMany();
    const topLeads = await base().orderBy('l.score', 'DESC').limit(5).getMany();
    return { total, newLeads, contacted, qualified, converted, conversionRate, byPlatform, topLeads };
  }

  private async getCampaignStats(userId: string) {
    const campaigns = await this.campaignRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 10 });
    return { total: campaigns.length, running: campaigns.filter(c => c.status === 'running').length, completed: campaigns.filter(c => c.status === 'completed').length, recent: campaigns };
  }

  async getCampaignDetail(campaignId: string) {
    const base = () => this.callRepo.createQueryBuilder('c').where('c.campaignId = :campaignId', { campaignId });
    const [total, completed] = await Promise.all([base().getCount(), base().andWhere('c.status = :s', { s: 'completed' }).getCount()]);
    const outcomes = await base().select('c.outcome', 'outcome').addSelect('COUNT(*)', 'count').groupBy('c.outcome').getRawMany();
    return { totalCalls: total, completedCalls: completed, outcomes };
  }
}
