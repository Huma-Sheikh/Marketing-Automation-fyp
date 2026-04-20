import { Repository } from 'typeorm';
import { Campaign } from '../database/entities/campaign.entity';
import { Lead } from '../database/entities/lead.entity';
import { CallingService } from '../calling/calling.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
export declare class CampaignService {
    private campaignRepo;
    private leadRepo;
    private callingService;
    private emailService;
    private smsService;
    private readonly logger;
    constructor(campaignRepo: Repository<Campaign>, leadRepo: Repository<Lead>, callingService: CallingService, emailService: EmailService, smsService: SmsService);
    createCampaign(userId: string, dto: {
        name: string;
        type: string;
        settings?: any;
    }): Promise<Campaign>;
    startCampaign(campaignId: string, userId: string): Promise<{
        message: string;
        campaignId?: undefined;
        results?: undefined;
    } | {
        message: string;
        campaignId: string;
        results: any;
    }>;
    stopCampaign(campaignId: string): Promise<{
        message: string;
    }>;
    getCampaigns(userId: string): Promise<Campaign[]>;
    getCampaignStats(campaignId: string): Promise<{
        campaign: Campaign;
        activeCalls: number;
    }>;
    deleteCampaign(campaignId: string): Promise<{
        deleted: boolean;
    }>;
}
