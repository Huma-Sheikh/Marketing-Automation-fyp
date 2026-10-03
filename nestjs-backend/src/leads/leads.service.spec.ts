import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { Lead } from '../database/entities/lead.entity';
import { AiService } from '../ai/ai.service';
import { NotFoundException } from '@nestjs/common';

const makeQB = (rows: any[] = []) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
});

const mockLeadRepo = {
  createQueryBuilder: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
};

const mockAiService = {
  scrapeLeads: jest.fn(),
  scoreLead: jest.fn(),
};

describe('LeadsService', () => {
  let service: LeadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: getRepositoryToken(Lead), useValue: mockLeadRepo },
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    jest.clearAllMocks();
  });

  // ─── getPlatformScore (private — tested via reflection) ──────────────────────

  describe('getPlatformScore', () => {
    const fn = (platform: string) => (service as any).getPlatformScore(platform);

    it.each([
      ['linkedin', 5],
      ['instagram', 4],
      ['twitter', 3],
      ['tiktok', 3],
      ['facebook', 2],
      ['unknown', 2],
    ])('returns %i for platform %s', (platform, expected) => {
      expect(fn(platform)).toBe(expected);
    });
  });

  // ─── getJobScore (private) ────────────────────────────────────────────────────

  describe('getJobScore', () => {
    const fn = (title: string | null) => (service as any).getJobScore(title);

    it.each([
      ['CEO', 5],
      ['Co-Founder', 5],
      ['founder', 5],
      ['Director of Sales', 4],
      ['VP Marketing', 4],
      ['Senior Manager', 3],
      ['Developer', 2],
      ['', 1],
      [null, 1],
    ])('returns %i for title "%s"', (title, expected) => {
      expect(fn(title)).toBe(expected);
    });
  });

  // ─── scrapeAndSave ────────────────────────────────────────────────────────────

  describe('scrapeAndSave', () => {
    it('returns empty result when scraping yields no leads', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([]);

      const result = await service.scrapeAndSave('u1', 'linkedin', 'CEO Dubai', 10);

      expect(result).toEqual({ message: 'No leads found', count: 0, leads: [] });
    });

    it('saves each scraped lead with an AI-generated score', async () => {
      const raw = {
        firstName: 'Ahmed', lastName: 'Ali', email: 'ahmed@co.ae',
        jobTitle: 'CEO', engagement: 80,
      };
      mockAiService.scrapeLeads.mockResolvedValue([raw]);
      mockAiService.scoreLead.mockResolvedValue(88);
      const saved = { id: 'l1', ...raw, score: 88 };
      mockLeadRepo.create.mockReturnValue(saved);
      mockLeadRepo.save.mockResolvedValue(saved);

      const result = await service.scrapeAndSave('u1', 'linkedin', 'CEO', 5);

      expect(result.count).toBe(1);
      expect(result.leads[0].score).toBe(88);
      expect(mockAiService.scoreLead).toHaveBeenCalledTimes(1);
    });

    it('passes correct platform_origin for linkedin to scoreLead', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([{ firstName: 'A', jobTitle: 'Manager' }]);
      mockAiService.scoreLead.mockResolvedValue(60);
      mockLeadRepo.create.mockReturnValue({});
      mockLeadRepo.save.mockResolvedValue({});

      await service.scrapeAndSave('u1', 'linkedin', 'test', 5);

      expect(mockAiService.scoreLead).toHaveBeenCalledWith(
        expect.objectContaining({ platform_origin: 5 }),
      );
    });

    it('passes correct platform_origin for twitter to scoreLead', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([{ firstName: 'B', jobTitle: '' }]);
      mockAiService.scoreLead.mockResolvedValue(30);
      mockLeadRepo.create.mockReturnValue({});
      mockLeadRepo.save.mockResolvedValue({});

      await service.scrapeAndSave('u1', 'twitter', 'test', 5);

      expect(mockAiService.scoreLead).toHaveBeenCalledWith(
        expect.objectContaining({ platform_origin: 3 }),
      );
    });

    it('handles raw lead with missing name gracefully', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([{ name: 'John Doe', jobTitle: 'Manager' }]);
      mockAiService.scoreLead.mockResolvedValue(55);
      mockLeadRepo.create.mockReturnValue({});
      mockLeadRepo.save.mockResolvedValue({ id: 'l2' });

      const result = await service.scrapeAndSave('u1', 'instagram', 'test', 5);

      expect(result.count).toBe(1);
    });

    it('sets has_email flag to 1 when email present', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([{ email: 'x@x.com' }]);
      mockAiService.scoreLead.mockResolvedValue(70);
      mockLeadRepo.create.mockReturnValue({});
      mockLeadRepo.save.mockResolvedValue({});

      await service.scrapeAndSave('u1', 'facebook', 'q', 5);

      expect(mockAiService.scoreLead).toHaveBeenCalledWith(
        expect.objectContaining({ has_email: 1 }),
      );
    });

    it('sets has_email flag to 0 when email absent', async () => {
      mockAiService.scrapeLeads.mockResolvedValue([{ firstName: 'X' }]);
      mockAiService.scoreLead.mockResolvedValue(30);
      mockLeadRepo.create.mockReturnValue({});
      mockLeadRepo.save.mockResolvedValue({});

      await service.scrapeAndSave('u1', 'facebook', 'q', 5);

      expect(mockAiService.scoreLead).toHaveBeenCalledWith(
        expect.objectContaining({ has_email: 0 }),
      );
    });
  });

  // ─── buildScoreFeatures ───────────────────────────────────────────────────────

  describe('buildScoreFeatures', () => {
    const build = (platform: string, raw: any) =>
      (service as any).buildScoreFeatures(platform, raw);

    // Regression test: these keys must match feature_names in
    // model/scorer/training_summary.json. When they drifted, leads-service fell
    // back to defaults and every lead scored identically.
    it('emits exactly the 8 feature names the trained scorer expects', () => {
      const features = build('linkedin', { firstName: 'A', email: 'a@b.com' });

      expect(Object.keys(features).sort()).toEqual([
        'bio_completeness',
        'company_size_indicator',
        'engagement_estimate',
        'has_email',
        'has_phone',
        'industry_signal',
        'job_title_seniority',
        'platform_origin',
      ]);
    });

    it('produces different feature vectors for a strong and a weak lead', () => {
      const strong = build('linkedin', {
        firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '+1', company: 'C',
        jobTitle: 'CEO', location: 'Dubai', website: 'c.com', engagement: 90,
      });
      const weak = build('facebook', { firstName: 'X' });

      expect(strong).not.toEqual(weak);
      expect(strong.platform_origin).toBeGreaterThan(weak.platform_origin);
      expect(strong.job_title_seniority).toBeGreaterThan(weak.job_title_seniority);
      expect(strong.bio_completeness).toBeGreaterThan(weak.bio_completeness);
    });

    it('scores bio_completeness as the fraction of populated profile fields', () => {
      expect(build('linkedin', {}).bio_completeness).toBe(0);
      expect(
        build('linkedin', {
          firstName: 'A', lastName: 'B', email: 'e', phone: 'p',
          company: 'c', jobTitle: 'j', location: 'l', website: 'w',
        }).bio_completeness,
      ).toBe(1);
      expect(build('linkedin', { firstName: 'A', lastName: 'B' }).bio_completeness).toBe(0.25);
    });

    it('ignores blank strings when measuring completeness', () => {
      expect(build('linkedin', { firstName: '  ', lastName: '' }).bio_completeness).toBe(0);
    });

    it('defaults engagement_estimate to 50 when the scrape has no value', () => {
      expect(build('linkedin', {}).engagement_estimate).toBe(50);
      expect(build('linkedin', { engagement: 0 }).engagement_estimate).toBe(0);
    });
  });

  // ─── getLeads ─────────────────────────────────────────────────────────────────

  describe('getLeads', () => {
    it('returns leads ordered by score DESC for a given user', async () => {
      const qb = makeQB([{ id: 'l1' }]);
      mockLeadRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLeads('u1');

      expect(qb.where).toHaveBeenCalledWith('lead.userId = :userId', { userId: 'u1' });
      expect(qb.orderBy).toHaveBeenCalledWith('lead.score', 'DESC');
      expect(result).toEqual([{ id: 'l1' }]);
    });

    it('applies status filter when provided', async () => {
      const qb = makeQB([]);
      mockLeadRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getLeads('u1', 'qualified');

      expect(qb.andWhere).toHaveBeenCalledWith('lead.status = :status', { status: 'qualified' });
    });

    it('does not apply status filter when status is undefined', async () => {
      const qb = makeQB([]);
      mockLeadRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getLeads('u1');

      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  });

  // ─── getLead ──────────────────────────────────────────────────────────────────

  describe('getLead', () => {
    it('returns lead scoped to the owning user', async () => {
      const lead = { id: 'l-1', firstName: 'Alice' };
      mockLeadRepo.findOne.mockResolvedValue(lead);

      const result = await service.getLead('l-1', 'u1');

      expect(result).toEqual(lead);
      expect(mockLeadRepo.findOne).toHaveBeenCalledWith({ where: { id: 'l-1', userId: 'u1' } });
    });

    it('throws NotFound when the lead belongs to another tenant', async () => {
      mockLeadRepo.findOne.mockResolvedValue(null);

      await expect(service.getLead('l-1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateLead ───────────────────────────────────────────────────────────────

  describe('updateLead', () => {
    it('updates lead scoped to the owning user and returns updated record', async () => {
      const updated = { id: 'l-1', status: 'qualified' };
      mockLeadRepo.update.mockResolvedValue({ affected: 1 });
      mockLeadRepo.findOne.mockResolvedValue(updated);

      const result = await service.updateLead('l-1', 'u1', { status: 'qualified' } as any);

      expect(mockLeadRepo.update).toHaveBeenCalledWith(
        { id: 'l-1', userId: 'u1' },
        { status: 'qualified' },
      );
      expect(result).toEqual(updated);
    });

    it('throws NotFound when no row matched the id + owner pair', async () => {
      mockLeadRepo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateLead('l-1', 'attacker', { status: 'qualified' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('ignores attempts to reassign a lead to another user via the body', async () => {
      mockLeadRepo.update.mockResolvedValue({ affected: 1 });
      mockLeadRepo.findOne.mockResolvedValue({ id: 'l-1' });

      await service.updateLead('l-1', 'u1', { userId: 'attacker', id: 'other', status: 'new' } as any);

      expect(mockLeadRepo.update).toHaveBeenCalledWith(
        { id: 'l-1', userId: 'u1' },
        { status: 'new' },
      );
    });
  });

  // ─── deleteLead ───────────────────────────────────────────────────────────────

  describe('deleteLead', () => {
    it('deletes lead scoped to the owning user', async () => {
      mockLeadRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteLead('l-1', 'u1');

      expect(result).toEqual({ deleted: true });
      expect(mockLeadRepo.delete).toHaveBeenCalledWith({ id: 'l-1', userId: 'u1' });
    });

    it('throws NotFound rather than deleting a lead owned by another tenant', async () => {
      mockLeadRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteLead('l-1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── importLeads ──────────────────────────────────────────────────────────────

  describe('importLeads', () => {
    it('bulk-saves all leads with status "new" and correct userId', async () => {
      const leads = [
        { firstName: 'Alice', email: 'a@a.com' },
        { firstName: 'Bob', email: 'b@b.com' },
      ];
      mockLeadRepo.create.mockImplementation((d) => d);
      mockLeadRepo.save.mockImplementation((l) => Promise.resolve({ id: 'new', ...l }));

      const result = await service.importLeads('u1', leads);

      expect(result.count).toBe(2);
      expect(result.message).toBe('Imported');
    });

    it('sets status = "new" and userId on every imported lead', async () => {
      mockLeadRepo.create.mockImplementation((d) => d);
      mockLeadRepo.save.mockResolvedValue({ id: '1' });

      await service.importLeads('user-99', [{ firstName: 'X' }]);

      expect(mockLeadRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-99', status: 'new' }),
      );
    });

    it('handles empty array without error', async () => {
      const result = await service.importLeads('u1', []);

      expect(result).toEqual({ message: 'Imported', count: 0 });
    });
  });

  // ─── getLeadsByIds ────────────────────────────────────────────────────────────

  describe('getLeadsByIds', () => {
    it('returns empty array when ids is empty', async () => {
      const result = await service.getLeadsByIds([], 'u1');

      expect(result).toEqual([]);
      expect(mockLeadRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('queries leads by ids, scoped to the owning user', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]),
      };
      mockLeadRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLeadsByIds(['l1', 'l2'], 'u1');

      expect(qb.where).toHaveBeenCalledWith('lead.id IN (:...ids)', { ids: ['l1', 'l2'] });
      expect(qb.andWhere).toHaveBeenCalledWith('lead.userId = :userId', { userId: 'u1' });
      expect(result).toHaveLength(2);
    });
  });
});
