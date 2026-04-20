export declare class SmsService {
    private readonly logger;
    sendSms(to: string, message: string): Promise<boolean>;
    sendBulkSms(leads: any[], template: string): Promise<{
        sent: number;
        failed: number;
    }>;
}
