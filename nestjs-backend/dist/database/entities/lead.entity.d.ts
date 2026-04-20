import { User } from './user.entity';
export declare class Lead {
    id: string;
    user: User;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    jobTitle: string;
    location: string;
    website: string;
    sourceplatform: string;
    score: number;
    status: string;
    rawData: object;
    createdAt: Date;
}
