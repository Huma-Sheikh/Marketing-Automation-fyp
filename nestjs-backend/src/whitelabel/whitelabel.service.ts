import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agency } from '../database/entities/agency.entity';
@Injectable()
export class WhitelabelService {
  constructor(@InjectRepository(Agency) private agencyRepo: Repository<Agency>) {}

  async createAgency(ownerId: string, dto: any) {
    const a = this.agencyRepo.create({ ownerId, agencyName: dto.agencyName, customDomain: dto.customDomain, primaryColor: dto.primaryColor || '#2563EB', logoUrl: dto.logoUrl, callerIdName: dto.callerIdName || dto.agencyName, limits: dto.limits || { maxCalls: 1000, maxLeads: 5000, maxCampaigns: 10, maxUsers: 5 }, status: 'active' });
    return this.agencyRepo.save(a);
  }

  async getBrandingByDomain(domain: string) {
    const agency = await this.agencyRepo.findOne({ where: { customDomain: domain, status: 'active' } });
    if (!agency) return { agencyName: 'Marketing Platform', primaryColor: '#1F3864', logoUrl: null, isWhiteLabel: false };
    return { agencyName: agency.agencyName, primaryColor: agency.primaryColor, logoUrl: agency.logoUrl, callerIdName: agency.callerIdName, isWhiteLabel: true };
  }

  async getAgencies(ownerId: string) { return this.agencyRepo.find({ where: { ownerId } }); }

  async updateAgency(id: string, ownerId: string, updates: any) {
    const a = await this.agencyRepo.findOne({ where: { id, ownerId } });
    if (!a) throw new NotFoundException('Agency not found');
    Object.assign(a, updates);
    return this.agencyRepo.save(a);
  }

  async deleteAgency(id: string) { await this.agencyRepo.delete(id); return { deleted: true }; }
}
