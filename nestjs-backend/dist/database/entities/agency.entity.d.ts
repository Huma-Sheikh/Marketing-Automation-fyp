import { User } from './user.entity';
export declare class Agency {
    id: string;
    owner: User;
    ownerId: string;
    agencyName: string;
    customDomain: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    callerIdName: string;
    supportEmail: string;
    limits: object;
    callsThisMonth: number;
    status: string;
    createdAt: Date;
}
