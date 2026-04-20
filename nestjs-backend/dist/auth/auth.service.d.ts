import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Subscription } from '../database/entities/subscription.entity';
export declare class AuthService {
    private userRepo;
    private subRepo;
    private jwtService;
    constructor(userRepo: Repository<User>, subRepo: Repository<Subscription>, jwtService: JwtService);
    register(email: string, password: string, businessName: string): Promise<{
        token: string;
        user: {
            id: string;
            email: string;
            businessName: string;
        };
    }>;
    login(email: string, password: string): Promise<{
        token: string;
        user: {
            id: string;
            email: string;
            businessName: string;
        };
    }>;
    getProfile(userId: string): Promise<User>;
}
