import { AuthService } from './auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(body: {
        email: string;
        password: string;
        businessName: string;
    }): Promise<{
        token: string;
        user: {
            id: string;
            email: string;
            businessName: string;
        };
    }>;
    login(body: {
        email: string;
        password: string;
    }): Promise<{
        token: string;
        user: {
            id: string;
            email: string;
            businessName: string;
        };
    }>;
    getProfile(req: any): Promise<import("../database/entities/user.entity").User>;
}
