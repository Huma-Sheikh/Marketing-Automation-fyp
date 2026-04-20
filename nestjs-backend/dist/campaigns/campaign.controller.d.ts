import { CampaignService } from './campaign.service';
export declare class CampaignController {
    private campaignService;
    constructor(campaignService: CampaignService);
    create(body: any, req: any): Promise<import("../database/entities/campaign.entity").Campaign>;
    getAll(req: any): Promise<import("../database/entities/campaign.entity").Campaign[]>;
    start(id: string, req: any): Promise<{
        message: string;
        campaignId?: undefined;
        results?: undefined;
    } | {
        message: string;
        campaignId: string;
        results: any;
    }>;
    stop(id: string): Promise<{
        message: string;
    }>;
    stats(id: string): Promise<{
        campaign: import("../database/entities/campaign.entity").Campaign;
        activeCalls: number;
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
}
