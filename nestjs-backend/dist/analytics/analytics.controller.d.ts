import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDashboard(req: any): Promise<{
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
            topLeads: import("../database/entities/lead.entity").Lead[];
        };
        campaigns: {
            total: number;
            running: number;
            completed: number;
            recent: import("../database/entities/campaign.entity").Campaign[];
        };
        aiHealth: object;
        generatedAt: string;
    }>;
    getCampaignDetail(id: string): Promise<{
        totalCalls: number;
        completedCalls: number;
        outcomes: any[];
    }>;
}
