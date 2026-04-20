import { Response } from 'express';
export declare class TwimlController {
    handleOutbound(leadId: string, campaignId: string, res: Response): void;
    handleInbound(res: Response): void;
    handleStatus(body: any): {
        received: boolean;
    };
}
