import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { CallingService } from '../calling/calling.service';
import { AiService } from '../ai/ai.service';
import { NotFoundException } from '@nestjs/common';

// ─── Query-builder factory ────────────────────────────────────────────────────
const makeCallQB = (overrides: Partial<{
  count: number; rawOne: any; rawMany: any[];
}> = {}) => {
  const { count = 0, rawOne = { avg: null }, rawMany = [] } = overrides;
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
    getRawMany: jest.fn().mockResolvedValue(rawMany),
  };
  return qb;
};

const makeLeadQB = (counts: number[] = [0, 0, 0, 0, 0], byPlatform: any[] = [], top: any[] = []) => {
  let callIdx = 0;
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockImplementation(() => Promise.resolve(counts[callIdx++] ?? 0)),
    getRawMany: jest.fn().mockResolvedValue(byPlatform),
    getMany: jest.fn().mockResolvedValue(top),
  };
  return qb;
};

const mockCallRepo = { createQueryBuilder: jest.fn() };
const mockLeadRepo = { createQueryBuilder: jest.fn() };
const mockCampaignRepo = { find: jest.fn(), findOne: jest.fn() };
const mockCallingService = { getActiveCallCount: jest.fn().mockReturnValue(0) };
const mockAiService = { checkHealth: jest.fn().mockResolvedValue({ 'STT/TTS': 'healthy' }) };

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Call), useValue: mockCallRepo },
        { provide: getRepositoryToken(Lead), useValue: mockLeadRepo },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        { provide: CallingService, useValue: mockCallingService },
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  // ─── getDashboardStats ────────────────────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('returns activeCalls, calls, leads, campaigns, aiHealth, generatedAt', async () => {
      // call stats QBs
      mockCallRepo.createQueryBuilder.mockReturnValue(
        makeCallQB({ count: 5, rawOne: { avg: 120 }, rawMany: [{ outcome: 'qualified', count: '3' }] }),
      );

      // lead stats QBs
      mockLeadRepo.createQueryBuilder.mockReturnValue(
        makeLeadQB([10, 3, 4, 2, 1], [{ platform: 'linkedin', count: '5' }], []),
      );

      mockCampaignRepo.find.mockResolvedValue([{ id: 'c1', status: 'running' }]);
      mockCallingService.getActiveCallCount.mockReturnValue(2);
      mockAiService.checkHealth.mockResolvedValue({ 'STT/TTS': 'healthy' });

      const result = await service.getDashboardStats('u1');

      expect(result).toHaveProperty('activeCalls', 2);
      expect(result).toHaveProperty('calls');
      expect(result).toHaveProperty('leads');
      expect(result).toHaveProperty('campaigns');
      expect(result).toHaveProperty('aiHealth');
      expect(result).toHaveProperty('generatedAt');
      expect(typeof result.generatedAt).toBe('string');
    });
  });

  // ─── getCallStats (private — tested via getDashboardStats proxy) ──────────────

  describe('call stats calculations', () => {
    it('rounds avgDurationSeconds', async () => {
      // All getCount calls return 0; getRawOne returns avg 67.7
      const qb = makeCallQB({ count: 0, rawOne: { avg: 67.7 } });
      mockCallRepo.createQueryBuilder.mockReturnValue(qb);
      mockLeadRepo.createQueryBuilder.mockReturnValue(makeLeadQB([]));
      mockCampaignRepo.find.mockResolvedValue([]);

      const result = await service.getDashboardStats('u1');

      expect(result.calls.avgDurationSeconds).toBe(68);
    });

    it('returns 0 for avgDurationSeconds when no completed calls', async () => {
      const qb = makeCallQB({ rawOne: { avg: null } });
      mockCallRepo.createQueryBuilder.mockReturnValue(qb);
      mockLeadRepo.createQueryBuilder.mockReturnValue(makeLeadQB([]));
      mockCampaignRepo.find.mockResolvedValue([]);

      const result = await service.getDashboardStats('u1');

      expect(result.calls.avgDurationSeconds).toBe(0);
    });
  });

  // ─── getLeadStats (private) ───────────────────────────────────────────────────

  describe('lead stats calculations', () => {
    it('calculates conversionRate correctly (converted/total * 100)', async () => {
      // total=10, new=3, contacted=4, qualified=2, converted=1 → 10%
      mockLeadRepo.createQueryBuilder.mockReturnValue(
        makeLeadQB([10, 3, 4, 2, 1]),
      );
      mockCallRepo.createQueryBuilder.mockReturnValue(makeCallQB());
      mockCampaignRepo.find.mockResolvedValue([]);

      const result = await service.getDashboardStats('u1');

      expect(result.leads.conversionRate).toBe('10.0');
    });

    it('returns conversionRate "0.0" when total is 0', async () => {
      mockLeadRepo.createQueryBuilder.mockReturnValue(makeLeadQB([0, 0, 0, 0, 0]));
      mockCallRepo.createQueryBuilder.mockReturnValue(makeCallQB());
      mockCampaignRepo.find.mockResolvedValue([]);

      const result = await service.getDashboardStats('u1');

      expect(result.leads.conversionRate).toBe('0.0');
    });
  });

  // ─── getCampaignStats (private) ───────────────────────────────────────────────

  describe('campaign stats', () => {
    it('counts running and completed campaigns correctly', async () => {
      const campaigns = [
        { id: 'c1', status: 'running', createdAt: new Date() },
        { id: 'c2', status: 'completed', createdAt: new Date() },
        { id: 'c3', status: 'draft', createdAt: new Date() },
      ];
      mockCampaignRepo.find.mockResolvedValue(campaigns);
      mockCallRepo.createQueryBuilder.mockReturnValue(makeCallQB());
      mockLeadRepo.createQueryBuilder.mockReturnValue(makeLeadQB([]));

      const result = await service.getDashboardStats('u1');

      expect(result.campaigns.running).toBe(1);
      expect(result.campaigns.completed).toBe(1);
      expect(result.campaigns.total).toBe(3);
    });
  });

  // ─── getCampaignDetail ────────────────────────────────────────────────────────

  describe('getCampaignDetail', () => {
    it('returns totalCalls, completedCalls, outcomes', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getCount: jest.fn()
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(7),
        getRawMany: jest.fn().mockResolvedValue([
          { outcome: 'qualified', count: '4' },
          { outcome: 'not-interested', count: '3' },
        ]),
      };
      mockCallRepo.createQueryBuilder.mockReturnValue(qb);

      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', userId: 'u1' });

      const result = await service.getCampaignDetail('c1', 'u1');

      expect(result.totalCalls).toBe(10);
      expect(result.completedCalls).toBe(7);
      expect(result.outcomes).toHaveLength(2);
    });

    it('throws NotFound for a campaign owned by someone else', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.getCampaignDetail('c1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });
});
