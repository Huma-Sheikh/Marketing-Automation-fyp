import { LeadsService } from './leads.service';
export declare class LeadsController {
    private leadsService;
    constructor(leadsService: LeadsService);
    scrape(body: {
        platform: string;
        query: string;
        maxResults?: number;
    }, req: any): Promise<{
        message: string;
        count: number;
        leads: any[];
    }>;
    getAll(req: any, status?: string): Promise<import("../database/entities/lead.entity").Lead[]>;
    getOne(id: string): Promise<import("../database/entities/lead.entity").Lead>;
    update(id: string, body: any): Promise<import("../database/entities/lead.entity").Lead>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
    importLeads(body: {
        leads: any[];
    }, req: any): Promise<{
        message: string;
        count: number;
    }>;
}
