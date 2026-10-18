import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Agency } from '../../database/entities/agency.entity';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/agency-fields.dto';
import { DEFAULT_AGENCY_COLOR, DEFAULT_AGENCY_LIMITS, DEFAULT_BRANDING } from './whitelabel.constants';

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

/** White-label agencies (custom domain + branding) owned by a tenant. */
@Injectable()
export class WhitelabelService {
  constructor(@InjectRepository(Agency) private agencyRepo: Repository<Agency>) {}

  async createAgency(ownerId: string, dto: CreateAgencyDto) {
    const agency = this.agencyRepo.create({
      ownerId,
      agencyName: dto.agencyName,
      customDomain: dto.customDomain,
      primaryColor: dto.primaryColor || DEFAULT_AGENCY_COLOR,
      logoUrl: dto.logoUrl,
      callerIdName: dto.callerIdName || dto.agencyName,
      limits: dto.limits || { ...DEFAULT_AGENCY_LIMITS },
      status: 'active',
    });
    return this.saveAgency(agency);
  }

  async getBrandingByDomain(domain: string) {
    const agency = await this.agencyRepo.findOne({ where: { customDomain: domain, status: 'active' } });
    if (!agency) return { ...DEFAULT_BRANDING };
    return {
      agencyName: agency.agencyName,
      primaryColor: agency.primaryColor,
      logoUrl: agency.logoUrl,
      callerIdName: agency.callerIdName,
      isWhiteLabel: true,
    };
  }

  async getAgencies(ownerId: string) {
    return this.agencyRepo.find({ where: { ownerId } });
  }

  /** `updates` is a whitelisted DTO, so ownerId and usage counters cannot be changed here. */
  async updateAgency(id: string, ownerId: string, updates: UpdateAgencyDto) {
    const agency = await this.agencyRepo.findOne({ where: { id, ownerId } });
    if (!agency) throw new NotFoundException('Agency not found');
    Object.assign(agency, updates);
    return this.saveAgency(agency);
  }

  async deleteAgency(id: string, ownerId: string) {
    const result = await this.agencyRepo.delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException('Agency not found');
    return { deleted: true };
  }

  /** Save, turning a duplicate custom domain into a 409 the UI can show. */
  private async saveAgency(agency: Agency) {
    try {
      return await this.agencyRepo.save(agency);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === UNIQUE_VIOLATION) {
        throw new ConflictException('That custom domain is already used by another agency');
      }
      throw err;
    }
  }
}
