export declare class EmailService {
    private readonly logger;
    sendCampaignEmail(options: {
        to: string;
        leadName: string;
        subject: string;
        template: string;
        variables?: Record<string, string>;
    }): Promise<boolean>;
    sendBulkEmails(leads: any[], subject: string, template: string): Promise<{
        sent: number;
        failed: number;
    }>;
}
