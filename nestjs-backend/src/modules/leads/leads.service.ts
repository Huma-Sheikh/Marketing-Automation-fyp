import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../database/entities/lead.entity';
import { AiService } from '../ai/ai.service';
import { ImportLeadDto } from './dto/import-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { buildScoreFeatures } from './lead-scoring';

/** Columns a client may set. Anything else in a body is ignored. */
const WRITABLE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle',
  'location', 'website', 'score', 'status', 'sourceplatform', 'rawData',
] as const;

function pickWritable(input: Record<string, any>): Partial<Lead> {
  const out: Record<string, any> = {};
  for (const key of WRITABLE_FIELDS) if (input?.[key] !== undefined) out[key] = input[key];
  return out;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    private readonly aiService: AiService,
  ) {}

  /** Scrape a platform via leads-service, score each profile, and save it as a new lead. */
  async scrapeAndSave(userId: string, platform: string, query: string, maxResults: number) {
    this.logger.log(`Scraping ${platform} for: ${query}`);
    const rawLeads = await this.aiService.scrapeLeads(platform, query, maxResults);
    if (!rawLeads.length) return { message: 'No leads found', count: 0, leads: [] };

    const saved: Lead[] = [];
    for (const raw of rawLeads) {
      const score = await this.aiService.scoreLead(buildScoreFeatures(platform, raw));
      const [first, last] = String(raw.name || '').split(' ');
      const lead = this.leadRepo.create({
        userId,
        firstName: raw.firstName || first || '',
        lastName: raw.lastName || last || '',
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

  async updateLead(id: string, userId: string, updates: UpdateLeadDto) {
    // id/userId are never client-updatable, whatever the body says.
    const result = await this.leadRepo.update({ id, userId }, pickWritable(updates));
    if (!result.affected) throw new NotFoundException('Lead not found');
    return this.leadRepo.findOne({ where: { id, userId } });
  }

  async deleteLead(id: string, userId: string) {
    const result = await this.leadRepo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Lead not found');
    return { deleted: true };
  }

  async importLeads(userId: string, leads: ImportLeadDto[]) {
    const saved: Lead[] = [];
    for (const input of leads) {
      // Only whitelisted fields are copied: an `id` in the body would otherwise
      // turn this insert into an update of somebody else's lead.
      const lead = this.leadRepo.create({ ...pickWritable(input), userId, status: 'new' });
      saved.push(await this.leadRepo.save(lead));
    }
    return { message: 'Imported', count: saved.length };
  }
}
