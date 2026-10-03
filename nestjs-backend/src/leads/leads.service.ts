import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../database/entities/lead.entity';
import { AiService, LeadScoreFeatures } from '../ai/ai.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  constructor(
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    private aiService: AiService,
  ) {}

  /**
   * All three helpers below produce features on the 1-5 scale the XGBoost scorer
   * was trained on (see model/scorer/training_summary.json).
   */
  private getPlatformScore(platform: string) {
    return { linkedin: 5, instagram: 4, twitter: 3, tiktok: 3, facebook: 2 }[platform] ?? 2;
  }

  private getJobScore(title: string) {
    if (!title) return 1;
    const t = title.toLowerCase();
    if (t.includes('ceo') || t.includes('founder') || t.includes('owner')) return 5;
    if (t.includes('director') || t.includes('vp') || t.includes('vice president') || t.includes('head of')) return 4;
    if (t.includes('manager') || t.includes('lead')) return 3;
    return 2;
  }

  /**
   * Fraction of the profile fields we actually got a value for. A fuller profile
   * is both a richer lead and a signal the scrape found a real, active account.
   */
  private getBioCompleteness(raw: any): number {
    const fields = ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'location', 'website'];
    const filled = fields.filter(f => raw[f] != null && String(raw[f]).trim() !== '').length;
    return Math.round((filled / fields.length) * 100) / 100;
  }

  private buildScoreFeatures(platform: string, raw: any): LeadScoreFeatures {
    return {
      platform_origin: this.getPlatformScore(platform),
      job_title_seniority: this.getJobScore(raw.jobTitle),
      has_email: raw.email ? 1 : 0,
      has_phone: raw.phone ? 1 : 0,
      // We have no company-size or industry signal from a scrape yet, so both stay
      // neutral. Populate them when the NER/enrichment step starts returning them.
      company_size_indicator: 3,
      industry_signal: 3,
      engagement_estimate: typeof raw.engagement === 'number' ? raw.engagement : 50,
      bio_completeness: this.getBioCompleteness(raw),
    };
  }

  async scrapeAndSave(userId: string, platform: string, query: string, maxResults: number) {
    this.logger.log(`Scraping ${platform} for: ${query}`);
    const rawLeads = await this.aiService.scrapeLeads(platform, query, maxResults);
    if (!rawLeads.length) return { message: 'No leads found', count: 0, leads: [] };

    const saved = [];
    for (const raw of rawLeads) {
      const score = await this.aiService.scoreLead(this.buildScoreFeatures(platform, raw));
      const lead = this.leadRepo.create({
        userId,
        firstName: raw.firstName || (raw.name || '').split(' ')[0] || '',
        lastName: raw.lastName || (raw.name || '').split(' ')[1] || '',
        email: raw.email || null,
        phone: raw.phone || null,
        company: raw.company || null,
        jobTitle: raw.jobTitle || null,
        location: raw.location || null,
        website: raw.website || null,
        sourceplatform: platform,
        score,
        status: 'new',
        rawData: raw,
      });
      saved.push(await this.leadRepo.save(lead));
    }
    return { message: 'Leads scraped', count: saved.length, leads: saved };
  }

  async getLeads(userId: string, status?: string) {
    const qb = this.leadRepo.createQueryBuilder('lead')
      .where('lead.userId = :userId', { userId })
      .orderBy('lead.score', 'DESC');
    if (status) qb.andWhere('lead.status = :status', { status });
    return qb.getMany();
  }

  // Every single-lead operation is scoped by userId as well as id: without it any
  // authenticated user could read or delete another tenant's leads by guessing a
  // UUID. A miss is a 404 rather than a 403 so we don't confirm the row exists.
  async getLead(id: string, userId: string) {
    const lead = await this.leadRepo.findOne({ where: { id, userId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async updateLead(id: string, userId: string, updates: Partial<Lead>) {
    // userId/id are not client-updatable, whatever the body says.
    const { id: _id, userId: _userId, ...safeUpdates } = updates as any;
    const result = await this.leadRepo.update({ id, userId }, safeUpdates);
    if (!result.affected) throw new NotFoundException('Lead not found');
    return this.leadRepo.findOne({ where: { id, userId } });
  }

  async deleteLead(id: string, userId: string) {
    const result = await this.leadRepo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Lead not found');
    return { deleted: true };
  }

  async importLeads(userId: string, leads: any[]) {
    const saved = [];
    for (const l of leads) {
      const lead = this.leadRepo.create({ ...l, userId, status: 'new' });
      saved.push(await this.leadRepo.save(lead));
    }
    return { message: 'Imported', count: saved.length };
  }

  async getLeadsByIds(ids: string[], userId: string): Promise<Lead[]> {
    if (!ids.length) return [];
    return this.leadRepo.createQueryBuilder('lead')
      .where('lead.id IN (:...ids)', { ids })
      .andWhere('lead.userId = :userId', { userId })
      .getMany();
  }
}
