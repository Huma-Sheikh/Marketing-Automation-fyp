import { Lead } from './lead.entity';
import { Campaign } from './campaign.entity';
export declare class Call {
    id: string;
    lead: Lead;
    leadId: string;
    campaign: Campaign;
    campaignId: string;
    twilioCallSid: string;
    status: string;
    durationSeconds: number;
    transcript: string;
    outcome: string;
    recordingUrl: string;
    createdAt: Date;
}
