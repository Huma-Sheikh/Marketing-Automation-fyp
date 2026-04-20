import { BusinessService } from './business.service';
export declare class BusinessController {
    private businessService;
    constructor(businessService: BusinessService);
    search(body: {
        location: string;
        category: string;
    }): Promise<any[]>;
}
