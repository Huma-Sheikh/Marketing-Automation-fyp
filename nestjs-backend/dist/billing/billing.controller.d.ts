import { BillingService } from './billing.service';
export declare class BillingController {
    private billingService;
    constructor(billingService: BillingService);
    createCheckout(body: {
        plan: string;
    }, req: any): Promise<{
        url: any;
    }>;
    createPortal(req: any): Promise<{
        url: any;
    }>;
    getSubscription(req: any): Promise<{
        sub: import("../database/entities/subscription.entity").Subscription;
        limits: any;
    }>;
    handleWebhook(req: any, sig: string): Promise<{
        received: boolean;
    }>;
}
