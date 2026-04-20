import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../database/entities/lead.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  constructor(
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    private aiService: AiService,
  ) {}

  private getPlatformScore(platform: string) {
    return { linkedin: 4, instagram: 3, facebook: 2, twitter: 1 }[platform] || 2;
  }
  private getJobScore(title: string) {
    if (!title) return 1;
    const t = title.toLowerCase();
    if (t.includes('ceo') || t.includes('founder')) return 5;
    if (t.includes('director') || t.includes('vp')) return 4;
    if (t.includes('manager')) return 3;
    return 2;
  }

  async scrapeAndSave(userId: string, platform: string, query: string, maxResults: number) {
    this.logger.log(`Scraping ${platform} for: ${query}`);
    const rawLeads = await this.aiService.scrapeLeads(platform, query, maxResults);
    if (!rawLeads.length) return { message: 'No leads found', count: 0, leads: [] };

    const saved = [];
    for (const raw of rawLeads) {
      const score = await this.aiService.scoreLead({
        platform_score: this.getPlatformScore(platform),
        job_score: this.getJobScore(raw.jobTitle),
        has_email: raw.email ? 1 : 0,
        has_phone: raw.phone ? 1 : 0,
        has_website: raw.website ? 1 : 0,
        company_size_score: 3,
        engagement: raw.engagement || 50,
        industry_score: 3,
      });
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

  async getLead(id: string) {
    return this.leadRepo.findOne({ where: { id } });
  }

  async updateLead(id: string, updates: Partial<Lead>) {
    await this.leadRepo.update(id, updates);
    return this.leadRepo.findOne({ where: { id } });
  }

  async deleteLead(id: string) {
    await this.leadRepo.delete(id);
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

  async getLeadsByIds(ids: string[]): Promise<Lead[]> {
    if (!ids.length) return [];
    return this.leadRepo.createQueryBuilder('lead')
      .where('lead.id IN (:...ids)', { ids })
      .getMany();
  }
}
