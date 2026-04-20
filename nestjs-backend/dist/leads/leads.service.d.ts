import { Repository } from 'typeorm';
import { Lead } from '../database/entities/lead.entity';
import { AiService } from '../ai/ai.service';
export declare class LeadsService {
    private leadRepo;
    private aiService;
    private readonly logger;
    constructor(leadRepo: Repository<Lead>, aiService: AiService);
    private getPlatformScore;
    private getJobScore;
    scrapeAndSave(userId: string, platform: string, query: string, maxResults: number): Promise<{
        message: string;
        count: number;
        leads: any[];
    }>;
    getLeads(userId: string, status?: string): Promise<Lead[]>;
    getLead(id: string): Promise<Lead>;
    updateLead(id: string, updates: Partial<Lead>): Promise<Lead>;
    deleteLead(id: string): Promise<{
        deleted: boolean;
    }>;
    importLeads(userId: string, leads: any[]): Promise<{
        message: string;
        count: number;
    }>;
    getLeadsByIds(ids: string[]): Promise<Lead[]>;
}
