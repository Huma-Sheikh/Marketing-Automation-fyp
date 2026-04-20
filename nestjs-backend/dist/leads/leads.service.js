"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LeadsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const lead_entity_1 = require("../database/entities/lead.entity");
const ai_service_1 = require("../ai/ai.service");
let LeadsService = LeadsService_1 = class LeadsService {
    constructor(leadRepo, aiService) {
        this.leadRepo = leadRepo;
        this.aiService = aiService;
        this.logger = new common_1.Logger(LeadsService_1.name);
    }
    getPlatformScore(platform) {
        return { linkedin: 4, instagram: 3, facebook: 2, twitter: 1 }[platform] || 2;
    }
    getJobScore(title) {
        if (!title)
            return 1;
        const t = title.toLowerCase();
        if (t.includes('ceo') || t.includes('founder'))
            return 5;
        if (t.includes('director') || t.includes('vp'))
            return 4;
        if (t.includes('manager'))
            return 3;
        return 2;
    }
    async scrapeAndSave(userId, platform, query, maxResults) {
        this.logger.log(`Scraping ${platform} for: ${query}`);
        const rawLeads = await this.aiService.scrapeLeads(platform, query, maxResults);
        if (!rawLeads.length)
            return { message: 'No leads found', count: 0, leads: [] };
        const saved = [];
        for (const raw of rawLeads) {
            const score = await this.aiService.scoreLead({
                platform_score: this.getPlatformScore(platform),
                job_score: this.getJobScore(raw.jobTitle),
                has_email: raw.email ? 1 : 0,
                has_phone: raw.phone ? 1 : 0,
                has_website: raw.website ? 1 : 0,
                company_size_score: 3,
                engagement: raw.engagement || 50,
                industry_score: 3,
            });
            const lead = this.leadRepo.create({
                userId,
                firstName: raw.firstName || (raw.name || '').split(' ')[0] || '',
                lastName: raw.lastName || (raw.name || '').split(' ')[1] || '',
                email: raw.email || null,
                phone: raw.phone || null,
                company: raw.company || null,
                jobTitle: raw.jobTitle || null,
                location: raw.location || null,
                website: raw.website || null,
                sourceplatform: platform,
                score,
                status: 'new',
                rawData: raw,
            });
            saved.push(await this.leadRepo.save(lead));
        }
        return { message: 'Leads scraped', count: saved.length, leads: saved };
    }
    async getLeads(userId, status) {
        const qb = this.leadRepo.createQueryBuilder('lead')
            .where('lead.userId = :userId', { userId })
            .orderBy('lead.score', 'DESC');
        if (status)
            qb.andWhere('lead.status = :status', { status });
        return qb.getMany();
    }
    async getLead(id) {
        return this.leadRepo.findOne({ where: { id } });
    }
    async updateLead(id, updates) {
        await this.leadRepo.update(id, updates);
        return this.leadRepo.findOne({ where: { id } });
    }
    async deleteLead(id) {
        await this.leadRepo.delete(id);
        return { deleted: true };
    }
    async importLeads(userId, leads) {
        const saved = [];
        for (const l of leads) {
            const lead = this.leadRepo.create({ ...l, userId, status: 'new' });
            saved.push(await this.leadRepo.save(lead));
        }
        return { message: 'Imported', count: saved.length };
    }
    async getLeadsByIds(ids) {
        if (!ids.length)
            return [];
        return this.leadRepo.createQueryBuilder('lead')
            .where('lead.id IN (:...ids)', { ids })
            .getMany();
    }
};
exports.LeadsService = LeadsService;
exports.LeadsService = LeadsService = LeadsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(lead_entity_1.Lead)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        ai_service_1.AiService])
], LeadsService);
//# sourceMappingURL=leads.service.js.map