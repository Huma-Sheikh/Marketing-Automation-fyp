import { AiService } from '../ai/ai.service';
export declare class BusinessService {
    private aiService;
    constructor(aiService: AiService);
    searchBusinesses(location: string, category: string): Promise<any[]>;
}
