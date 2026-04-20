import { Repository } from 'typeorm';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { CallingService } from '../calling/calling.service';
import { AiService } from '../ai/ai.service';
export declare class AnalyticsService {
    private callRepo;
    private leadRepo;
    private campaignRepo;
    private callingService;
    private aiService;
    constructor(callRepo: Repository<Call>, leadRepo: Repository<Lead>, campaignRepo: Repository<Campaign>, callingService: CallingService, aiService: AiService);
    getDashboardStats(userId: string): Promise<{
        activeCalls: number;
        calls: {
            today: number;
            week: number;
            month: number;
            total: number;
            completed: number;
            avgDurationSeconds: number;
            outcomes: any[];
        };
        leads: {
            total: number;
            newLeads: number;
            contacted: number;
            qualified: number;
            converted: number;
            conversionRate: string;
            byPlatform: any[];
            topLeads: Lead[];
        };
        campaigns: {
            total: number;
            running: number;
            completed: number;
            recent: Campaign[];
        };
        aiHealth: object;
        generatedAt: string;
    }>;
    private getCallStats;
    private getLeadStats;
    private getCampaignStats;
    getCampaignDetail(campaignId: string): Promise<{
        totalCalls: number;
        completedCalls: number;
        outcomes: any[];
    }>;
}
