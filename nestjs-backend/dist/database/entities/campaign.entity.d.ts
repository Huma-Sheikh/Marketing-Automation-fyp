import { User } from './user.entity';
export declare class Campaign {
    id: string;
    user: User;
    userId: string;
    name: string;
    type: string;
    status: string;
    settings: object;
    totalLeads: number;
    contactedCount: number;
    qualifiedCount: number;
    convertedCount: number;
    createdAt: Date;
}
