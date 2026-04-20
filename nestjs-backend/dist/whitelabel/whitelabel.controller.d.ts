import { WhitelabelService } from './whitelabel.service';
export declare class WhitelabelController {
    private whitelabelService;
    constructor(whitelabelService: WhitelabelService);
    getBranding(domain: string): Promise<{
        agencyName: string;
        primaryColor: string;
        logoUrl: any;
        isWhiteLabel: boolean;
        callerIdName?: undefined;
    } | {
        agencyName: string;
        primaryColor: string;
        logoUrl: string;
        callerIdName: string;
        isWhiteLabel: boolean;
    }>;
    create(body: any, req: any): Promise<import("../database/entities/agency.entity").Agency>;
    getAll(req: any): Promise<import("../database/entities/agency.entity").Agency[]>;
    update(id: string, body: any, req: any): Promise<import("../database/entities/agency.entity").Agency>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
}
