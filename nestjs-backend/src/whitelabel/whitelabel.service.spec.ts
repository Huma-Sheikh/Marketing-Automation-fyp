import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { WhitelabelService } from './whitelabel.service';
import { Agency } from '../database/entities/agency.entity';

const mockAgencyRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
};

describe('WhitelabelService', () => {
  let service: WhitelabelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhitelabelService,
        { provide: getRepositoryToken(Agency), useValue: mockAgencyRepo },
      ],
    }).compile();

    service = module.get<WhitelabelService>(WhitelabelService);
    jest.clearAllMocks();
  });

  // ─── createAgency ─────────────────────────────────────────────────────────────

  describe('createAgency', () => {
    it('creates agency with provided dto fields', async () => {
      const dto = { agencyName: 'Pixel Agency', customDomain: 'pixel.com', primaryColor: '#FF0000' };
      const entity = { id: 'a1', ownerId: 'u1', ...dto };
      mockAgencyRepo.create.mockReturnValue(entity);
      mockAgencyRepo.save.mockResolvedValue(entity);

      const result = await service.createAgency('u1', dto);

      expect(mockAgencyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'u1', agencyName: 'Pixel Agency', customDomain: 'pixel.com' }),
      );
      expect(result).toEqual(entity);
    });

    it('uses default primaryColor "#2563EB" when not provided', async () => {
      const dto = { agencyName: 'Test', customDomain: 'test.com' };
      const entity = { id: 'a2', primaryColor: '#2563EB' };
      mockAgencyRepo.create.mockReturnValue(entity);
      mockAgencyRepo.save.mockResolvedValue(entity);

      await service.createAgency('u1', dto);

      expect(mockAgencyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ primaryColor: '#2563EB' }),
      );
    });

    it('uses agencyName as callerIdName when callerIdName not provided', async () => {
      const dto = { agencyName: 'Acme Agency', customDomain: 'acme.io' };
      const entity = { id: 'a3' };
      mockAgencyRepo.create.mockReturnValue(entity);
      mockAgencyRepo.save.mockResolvedValue(entity);

      await service.createAgency('u1', dto);

      expect(mockAgencyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ callerIdName: 'Acme Agency' }),
      );
    });

    it('sets default resource limits when not provided', async () => {
      const dto = { agencyName: 'X', customDomain: 'x.com' };
      const entity = { id: 'a4' };
      mockAgencyRepo.create.mockReturnValue(entity);
      mockAgencyRepo.save.mockResolvedValue(entity);

      await service.createAgency('u1', dto);

      expect(mockAgencyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: { maxCalls: 1000, maxLeads: 5000, maxCampaigns: 10, maxUsers: 5 },
        }),
      );
    });

    it('sets status to "active" on creation', async () => {
      const entity = { id: 'a5', status: 'active' };
      mockAgencyRepo.create.mockReturnValue(entity);
      mockAgencyRepo.save.mockResolvedValue(entity);

      await service.createAgency('u1', { agencyName: 'X', customDomain: 'x.com' });

      expect(mockAgencyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });
  });

  // ─── getBrandingByDomain ──────────────────────────────────────────────────────

  describe('getBrandingByDomain', () => {
    it('returns full branding when active agency found for domain', async () => {
      mockAgencyRepo.findOne.mockResolvedValue({
        agencyName: 'Pixel',
        primaryColor: '#FF0000',
        logoUrl: 'http://logo.png',
        callerIdName: 'Pixel Team',
      });

      const result = await service.getBrandingByDomain('pixel.com');

      expect(result).toEqual({
        agencyName: 'Pixel',
        primaryColor: '#FF0000',
        logoUrl: 'http://logo.png',
        callerIdName: 'Pixel Team',
        isWhiteLabel: true,
      });
    });

    it('returns default branding when no agency found', async () => {
      mockAgencyRepo.findOne.mockResolvedValue(null);

      const result = await service.getBrandingByDomain('unknown.com');

      expect(result).toEqual({
        agencyName: 'Marketing Platform',
        primaryColor: '#1F3864',
        logoUrl: null,
        isWhiteLabel: false,
      });
    });

    it('queries only active agencies', async () => {
      mockAgencyRepo.findOne.mockResolvedValue(null);

      await service.getBrandingByDomain('test.com');

      expect(mockAgencyRepo.findOne).toHaveBeenCalledWith({
        where: { customDomain: 'test.com', status: 'active' },
      });
    });
  });

  // ─── getAgencies ──────────────────────────────────────────────────────────────

  describe('getAgencies', () => {
    it('returns agencies for owner', async () => {
      const agencies = [{ id: 'a1' }, { id: 'a2' }];
      mockAgencyRepo.find.mockResolvedValue(agencies);

      const result = await service.getAgencies('u1');

      expect(mockAgencyRepo.find).toHaveBeenCalledWith({ where: { ownerId: 'u1' } });
      expect(result).toEqual(agencies);
    });
  });

  // ─── updateAgency ─────────────────────────────────────────────────────────────

  describe('updateAgency', () => {
    it('throws NotFoundException when agency not found', async () => {
      mockAgencyRepo.findOne.mockResolvedValue(null);

      await expect(service.updateAgency('a99', 'u1', { agencyName: 'X' }))
        .rejects.toThrow(NotFoundException);
    });

    it('updates and saves agency', async () => {
      const existing = { id: 'a1', agencyName: 'Old', primaryColor: '#000' };
      mockAgencyRepo.findOne.mockResolvedValue(existing);
      mockAgencyRepo.save.mockResolvedValue({ ...existing, agencyName: 'New' });

      const result = await service.updateAgency('a1', 'u1', { agencyName: 'New' });

      expect(mockAgencyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ agencyName: 'New' }),
      );
    });
  });

  // ─── deleteAgency ─────────────────────────────────────────────────────────────

  describe('deleteAgency', () => {
    it('deletes agency scoped to its owner', async () => {
      mockAgencyRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteAgency('a1', 'owner-1');

      expect(mockAgencyRepo.delete).toHaveBeenCalledWith({ id: 'a1', ownerId: 'owner-1' });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFound rather than deleting an agency owned by someone else', async () => {
      mockAgencyRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.deleteAgency('a1', 'attacker')).rejects.toThrow(NotFoundException);
    });
  });
});
