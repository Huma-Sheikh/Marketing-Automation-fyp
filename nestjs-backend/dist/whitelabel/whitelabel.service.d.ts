import { Repository } from 'typeorm';
import { Agency } from '../database/entities/agency.entity';
export declare class WhitelabelService {
    private agencyRepo;
    constructor(agencyRepo: Repository<Agency>);
    createAgency(ownerId: string, dto: any): Promise<Agency>;
    getBrandingByDomain(domain: string): Promise<{
        agencyName: string;
        primaryColor: string;
        logoUrl: any;
        isWhiteLabel: boolean;
        callerIdName?: undefined;
    } | {
        agencyName: string;
        primaryColor: string;
        logoUrl: string;
        callerIdName: string;
        isWhiteLabel: boolean;
    }>;
    getAgencies(ownerId: string): Promise<Agency[]>;
    updateAgency(id: string, ownerId: string, updates: any): Promise<Agency>;
    deleteAgency(id: string): Promise<{
        deleted: boolean;
    }>;
}
