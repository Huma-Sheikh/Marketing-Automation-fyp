import { Job } from 'bull';
import { CallingService } from '../calling/calling.service';
export declare class CallingQueueProcessor {
    private callingService;
    private readonly logger;
    constructor(callingService: CallingService);
    processDial(job: Job<{
        leadId: string;
        phoneNumber: string;
        campaignId: string;
        settings: any;
    }>): Promise<{
        skipped: boolean;
        reason: string;
        callSid?: undefined;
        status?: undefined;
    } | {
        callSid: string;
        status: string;
        skipped?: undefined;
        reason?: undefined;
    }>;
    onActive(job: Job): void;
    onCompleted(job: Job): void;
    onFailed(job: Job, err: Error): void;
}
