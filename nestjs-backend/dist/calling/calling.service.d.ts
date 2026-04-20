import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
export declare class CallingService {
    private callRepo;
    private leadRepo;
    private callingQueue;
    private config;
    private readonly logger;
    private activeConversations;
    private twilioClient;
    private fromNumber;
    constructor(callRepo: Repository<Call>, leadRepo: Repository<Lead>, callingQueue: Queue, config: ConfigService);
    startCampaignCalls(campaignId: string, leads: Lead[], settings: any): Promise<{
        queued: number;
        maxConcurrent: any;
    }>;
    initiateCall(leadId: string, phoneNumber: string, campaignId: string): Promise<string>;
    handleAudioChunk(callSid: string, audioBase64: string, aiService: any): Promise<Buffer | null>;
    handleCallComplete(callSid: string, duration: number, aiService: any): Promise<void>;
    getActiveCallCount(): number;
    stopCampaign(campaignId: string): Promise<void>;
}
