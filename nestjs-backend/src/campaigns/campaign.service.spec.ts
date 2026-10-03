import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { getQueueToken } from '@nestjs/bull';
import { CallingService } from '../calling/calling.service';

const mockCampaignRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockLeadRepo = {
  find: jest.fn(),
};

const mockCallingService = {
  startCampaignCalls: jest.fn(),
  stopCampaign: jest.fn(),
  assertCallerNumberUsable: jest.fn(),
  getActiveCallCount: jest.fn().mockReturnValue(0),
};

const makeQueue = () => ({
  addBulk: jest.fn().mockResolvedValue([]),
  getJobs: jest.fn().mockResolvedValue([]),
});

let mockEmailQueue: ReturnType<typeof makeQueue>;
let mockSmsQueue: ReturnType<typeof makeQueue>;

describe('CampaignService', () => {
  let service: CampaignService;

  beforeEach(async () => {
    mockEmailQueue = makeQueue();
    mockSmsQueue = makeQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        { provide: getRepositoryToken(Lead), useValue: mockLeadRepo },
        { provide: CallingService, useValue: mockCallingService },
        { provide: getQueueToken('email'), useValue: mockEmailQueue },
        { provide: getQueueToken('sms'), useValue: mockSmsQueue },
      ],
    }).compile();

    service = module.get<CampaignService>(CampaignService);
    jest.clearAllMocks();
  });

  // ─── createCampaign ───────────────────────────────────────────────────────────

  describe('createCampaign', () => {
    it('creates and saves a campaign with status "draft"', async () => {
      const dto = { name: 'Q1 Outreach', type: 'call' };
      const entity = { id: 'c1', ...dto, status: 'draft', userId: 'u1' };
      mockCampaignRepo.create.mockReturnValue(entity);
      mockCampaignRepo.save.mockResolvedValue(entity);

      const result = await service.createCampaign('u1', dto);

      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', name: 'Q1 Outreach', type: 'call', status: 'draft' }),
      );
      expect(result).toEqual(entity);
    });

    it('uses empty object as default settings', async () => {
      const entity = { id: 'c2', status: 'draft' };
      mockCampaignRepo.create.mockReturnValue(entity);
      mockCampaignRepo.save.mockResolvedValue(entity);

      await service.createCampaign('u1', { name: 'Test', type: 'email' });

      expect(mockCampaignRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ settings: {} }),
      );
    });
  });

  // ─── startCampaign ────────────────────────────────────────────────────────────

  describe('startCampaign', () => {
    it('throws NotFoundException when campaign does not exist', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.startCampaign('nonexistent', 'u1'))
        .rejects.toThrow(NotFoundException);
    });

    it('returns "Already running" message if campaign already running', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', status: 'running', type: 'call', settings: {} });

      const result = await service.startCampaign('c1', 'u1');

      expect(result).toEqual({ message: 'Already running' });
    });

    it('throws NotFoundException when no new leads available', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', status: 'draft', type: 'call', settings: {} });
      mockLeadRepo.find.mockResolvedValue([]);

      await expect(service.startCampaign('c1', 'u1'))
        .rejects.toThrow(NotFoundException);
    });

    it('starts call campaign and delegates to CallingService', async () => {
      const leads = [
        { id: 'l1', phone: '+971501234567', status: 'new' },
        { id: 'l2', phone: '+12125551234', status: 'new' },
      ];
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', status: 'draft', type: 'call', settings: { maxConcurrentCalls: 5 } });
      mockLeadRepo.find.mockResolvedValue(leads);
      mockCampaignRepo.update.mockResolvedValue({});
      mockCallingService.startCampaignCalls.mockResolvedValue({ queued: 2 });

      const result = await service.startCampaign('c1', 'u1');

      expect(mockCampaignRepo.update).toHaveBeenCalledWith('c1', { status: 'running', totalLeads: 2 });
      expect(mockCallingService.startCampaignCalls).toHaveBeenCalledWith(
        'c1', 'u1', expect.any(Array), expect.objectContaining({ maxConcurrentCalls: 5 }),
      );
      expect(result.message).toBe('Campaign started');
    });

    it('refuses to start when the pinned caller number is unusable, before queueing anything', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', status: 'draft', type: 'call', settings: { phoneNumberId: 'pn1' } });
      mockLeadRepo.find.mockResolvedValue([{ id: 'l1', phone: '+923001234567', status: 'new' }]);
      mockCallingService.assertCallerNumberUsable.mockRejectedValue(new BadRequestException('not verified'));

      await expect(service.startCampaign('c1', 'u1')).rejects.toThrow('not verified');

      expect(mockCallingService.assertCallerNumberUsable).toHaveBeenCalledWith('u1', 'pn1');
      expect(mockCampaignRepo.update).not.toHaveBeenCalled();
      expect(mockCallingService.startCampaignCalls).not.toHaveBeenCalled();
    });

    it('queues email jobs instead of sending inline', async () => {
      const leads = [{ id: 'l1', email: 'a@a.com', status: 'new' }];
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c2', status: 'draft', type: 'email', settings: {} });
      mockLeadRepo.find.mockResolvedValue(leads);
      mockCampaignRepo.update.mockResolvedValue({});

      const result = await service.startCampaign('c2', 'u1');

      expect(mockEmailQueue.addBulk).toHaveBeenCalledTimes(1);
      expect(mockEmailQueue.addBulk.mock.calls[0][0]).toHaveLength(1);
      expect(result.results.email).toEqual({ queued: 1, skipped: 0 });
      expect(mockCallingService.startCampaignCalls).not.toHaveBeenCalled();
    });

    it('tags every queued email job with its campaign id', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c2', status: 'draft', type: 'email', settings: {} });
      mockLeadRepo.find.mockResolvedValue([{ id: 'l1', email: 'a@a.com' }]);
      mockCampaignRepo.update.mockResolvedValue({});

      await service.startCampaign('c2', 'u1');

      expect(mockEmailQueue.addBulk.mock.calls[0][0][0]).toEqual(
        expect.objectContaining({
          name: 'send-email',
          data: expect.objectContaining({ campaignId: 'c2' }),
        }),
      );
    });

    it('queues SMS jobs instead of sending inline', async () => {
      const leads = [{ id: 'l1', phone: '+1111', status: 'new' }];
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c3', status: 'draft', type: 'sms', settings: {} });
      mockLeadRepo.find.mockResolvedValue(leads);
      mockCampaignRepo.update.mockResolvedValue({});

      const result = await service.startCampaign('c3', 'u1');

      expect(mockSmsQueue.addBulk).toHaveBeenCalledTimes(1);
      expect(result.results.sms).toEqual({ queued: 1, skipped: 0 });
    });

    it('does not touch the queues when no lead has the needed contact detail', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c3', status: 'draft', type: 'email', settings: {} });
      mockLeadRepo.find.mockResolvedValue([{ id: 'l1', email: null }]);
      mockCampaignRepo.update.mockResolvedValue({});

      const result = await service.startCampaign('c3', 'u1');

      expect(mockEmailQueue.addBulk).not.toHaveBeenCalled();
      expect(result.results.email).toEqual({ queued: 0, skipped: 1 });
    });

    it('starts all channels for "mixed" campaign', async () => {
      const leads = [{ id: 'l1', phone: '+1', email: 'x@x.com', status: 'new' }];
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c4', status: 'draft', type: 'mixed', settings: {} });
      mockLeadRepo.find.mockResolvedValue(leads);
      mockCampaignRepo.update.mockResolvedValue({});
      mockCallingService.startCampaignCalls.mockResolvedValue({});

      await service.startCampaign('c4', 'u1');

      expect(mockCallingService.startCampaignCalls).toHaveBeenCalled();
      expect(mockEmailQueue.addBulk).toHaveBeenCalled();
      expect(mockSmsQueue.addBulk).toHaveBeenCalled();
    });

    it('only calls leads with a phone number for call campaigns', async () => {
      const leads = [
        { id: 'l1', phone: '+1', status: 'new' },
        { id: 'l2', phone: null, status: 'new' },
      ];
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c5', status: 'draft', type: 'call', settings: {} });
      mockLeadRepo.find.mockResolvedValue(leads);
      mockCampaignRepo.update.mockResolvedValue({});
      mockCallingService.startCampaignCalls.mockResolvedValue({});

      await service.startCampaign('c5', 'u1');

      const calledLeads = mockCallingService.startCampaignCalls.mock.calls[0][2];
      expect(calledLeads).toHaveLength(1);
      expect(calledLeads[0].id).toBe('l1');
    });

    // Previously every campaign implicitly targeted *all* of the user's leads
    // with status 'new', so two campaigns could not address different segments.
    it('targets the explicit lead selection when settings.leadIds is given', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({
        id: 'c6', status: 'draft', type: 'call', settings: { leadIds: ['l1', 'l2'] },
      });
      mockLeadRepo.find.mockResolvedValue([{ id: 'l1', phone: '+1' }, { id: 'l2', phone: '+2' }]);
      mockCampaignRepo.update.mockResolvedValue({});
      mockCallingService.startCampaignCalls.mockResolvedValue({});

      await service.startCampaign('c6', 'u1');

      const where = mockLeadRepo.find.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.id).toBeDefined();       // In(['l1','l2'])
      expect(where.status).toBeUndefined(); // not restricted to unworked leads
    });

    it('falls back to unworked leads when no selection is given', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c7', status: 'draft', type: 'call', settings: {} });
      mockLeadRepo.find.mockResolvedValue([{ id: 'l1', phone: '+1' }]);
      mockCampaignRepo.update.mockResolvedValue({});
      mockCallingService.startCampaignCalls.mockResolvedValue({});

      await service.startCampaign('c7', 'u1');

      expect(mockLeadRepo.find).toHaveBeenCalledWith({ where: { userId: 'u1', status: 'new' } });
    });
  });

  // ─── stopCampaign ─────────────────────────────────────────────────────────────

  describe('stopCampaign', () => {
    it('updates status to "paused" and stops calls', async () => {
      mockCampaignRepo.update.mockResolvedValue({ affected: 1 });
      mockCallingService.stopCampaign.mockResolvedValue(undefined);

      const result = await service.stopCampaign('c1', 'u1');

      expect(mockCampaignRepo.update).toHaveBeenCalledWith(
        { id: 'c1', userId: 'u1' },
        { status: 'paused' },
      );
      expect(mockCallingService.stopCampaign).toHaveBeenCalledWith('c1');
      expect(result).toEqual({ message: 'Campaign stopped' });
    });

    it('removes this campaign\u2019s pending outreach jobs and leaves others alone', async () => {
      mockCampaignRepo.update.mockResolvedValue({ affected: 1 });
      mockCallingService.stopCampaign.mockResolvedValue(undefined);

      const mine = { data: { campaignId: 'c1' }, remove: jest.fn() };
      const theirs = { data: { campaignId: 'other' }, remove: jest.fn() };
      mockEmailQueue.getJobs.mockResolvedValue([mine, theirs]);

      await service.stopCampaign('c1', 'u1');

      expect(mine.remove).toHaveBeenCalled();
      expect(theirs.remove).not.toHaveBeenCalled();
    });

    it('throws NotFound and stops no calls for a campaign owned by someone else', async () => {
      mockCampaignRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.stopCampaign('c1', 'attacker')).rejects.toThrow(NotFoundException);
      expect(mockCallingService.stopCampaign).not.toHaveBeenCalled();
    });
  });

  // ─── getCampaigns ─────────────────────────────────────────────────────────────

  describe('getCampaigns', () => {
    it('returns campaigns ordered by createdAt DESC', async () => {
      const campaigns = [{ id: 'c2' }, { id: 'c1' }];
      mockCampaignRepo.find.mockResolvedValue(campaigns);

      const result = await service.getCampaigns('u1');

      expect(mockCampaignRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(campaigns);
    });
  });

  // ─── getCampaignStats ─────────────────────────────────────────────────────────

  describe('getCampaignStats', () => {
    it('returns campaign and active call count', async () => {
      const campaign = { id: 'c1', name: 'Test' };
      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockCallingService.getActiveCallCount.mockReturnValue(3);

      const result = await service.getCampaignStats('c1', 'u1');

      expect(mockCampaignRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', userId: 'u1' } });
      expect(result.campaign).toEqual(campaign);
      expect(result.activeCalls).toBe(3);
    });

    it('throws NotFound for a campaign owned by someone else', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.getCampaignStats('c1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteCampaign ───────────────────────────────────────────────────────────

  describe('deleteCampaign', () => {
    it('deletes campaign scoped to the owning user', async () => {
      mockCampaignRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteCampaign('c1', 'u1');

      expect(mockCampaignRepo.delete).toHaveBeenCalledWith({ id: 'c1', userId: 'u1' });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFound rather than deleting a campaign owned by someone else', async () => {
      mockCampaignRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteCampaign('c1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });
});
