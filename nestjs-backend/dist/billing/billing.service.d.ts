import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Subscription } from '../database/entities/subscription.entity';
import { User } from '../database/entities/user.entity';
export declare class BillingService {
    private subRepo;
    private userRepo;
    private config;
    private readonly logger;
    private readonly PLAN_PRICES;
    private readonly PLAN_LIMITS;
    constructor(subRepo: Repository<Subscription>, userRepo: Repository<User>, config: ConfigService);
    private getStripe;
    createCheckoutSession(userId: string, plan: string, successUrl: string, cancelUrl: string): Promise<{
        url: any;
    }>;
    createBillingPortal(userId: string, returnUrl: string): Promise<{
        url: any;
    }>;
    handleWebhook(rawBody: Buffer, signature: string): Promise<{
        received: boolean;
    }>;
    private activateSubscription;
    getSubscription(userId: string): Promise<{
        sub: Subscription;
        limits: any;
    }>;
    canMakeCall(userId: string): Promise<boolean>;
    incrementCallCount(userId: string): Promise<void>;
}
