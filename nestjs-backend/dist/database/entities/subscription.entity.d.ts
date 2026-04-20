import { User } from './user.entity';
export declare class Subscription {
    id: string;
    user: User;
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: string;
    status: string;
    currentPeriodEnd: Date;
    callsThisMonth: number;
    leadsCount: number;
    createdAt: Date;
}
