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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const call_entity_1 = require("../database/entities/call.entity");
const lead_entity_1 = require("../database/entities/lead.entity");
const campaign_entity_1 = require("../database/entities/campaign.entity");
const calling_service_1 = require("../calling/calling.service");
const ai_service_1 = require("../ai/ai.service");
let AnalyticsService = class AnalyticsService {
    constructor(callRepo, leadRepo, campaignRepo, callingService, aiService) {
        this.callRepo = callRepo;
        this.leadRepo = leadRepo;
        this.campaignRepo = campaignRepo;
        this.callingService = callingService;
        this.aiService = aiService;
    }
    async getDashboardStats(userId) {
        const [callStats, leadStats, campaignStats, aiHealth] = await Promise.all([
            this.getCallStats(userId),
            this.getLeadStats(userId),
            this.getCampaignStats(userId),
            this.aiService.checkHealth(),
        ]);
        return { activeCalls: this.callingService.getActiveCallCount(), calls: callStats, leads: leadStats, campaigns: campaignStats, aiHealth, generatedAt: new Date().toISOString() };
    }
    async getCallStats(userId) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const base = () => this.callRepo.createQueryBuilder('c')
            .innerJoin('c.campaign', 'camp')
            .where('camp.userId = :userId', { userId });
        const [today, week, month, total, completed] = await Promise.all([
            base().andWhere('c.createdAt >= :d', { d: todayStart }).getCount(),
            base().andWhere('c.createdAt >= :d', { d: weekStart }).getCount(),
            base().andWhere('c.createdAt >= :d', { d: monthStart }).getCount(),
            base().getCount(),
            base().andWhere('c.status = :s', { s: 'completed' }).getCount(),
        ]);
        const avgRaw = await base().andWhere('c.status = :s', { s: 'completed' })
            .select('AVG(c.durationSeconds)', 'avg').getRawOne();
        const avgDuration = Math.round(avgRaw?.avg || 0);
        const outcomes = await base().andWhere('c.outcome IS NOT NULL')
            .select('c.outcome', 'outcome').addSelect('COUNT(*)', 'count')
            .groupBy('c.outcome').getRawMany();
        return { today, week, month, total, completed, avgDurationSeconds: avgDuration, outcomes };
    }
    async getLeadStats(userId) {
        const base = () => this.leadRepo.createQueryBuilder('l').where('l.userId = :userId', { userId });
        const [total, newLeads, contacted, qualified, converted] = await Promise.all([
            base().getCount(),
            base().andWhere('l.status = :s', { s: 'new' }).getCount(),
            base().andWhere('l.status = :s', { s: 'contacted' }).getCount(),
            base().andWhere('l.status = :s', { s: 'qualified' }).getCount(),
            base().andWhere('l.status = :s', { s: 'converted' }).getCount(),
        ]);
        const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0';
        const byPlatform = await base()
            .select('l.sourceplatform', 'platform').addSelect('COUNT(*)', 'count')
            .groupBy('l.sourceplatform').getRawMany();
        const topLeads = await base().orderBy('l.score', 'DESC').limit(5).getMany();
        return { total, newLeads, contacted, qualified, converted, conversionRate, byPlatform, topLeads };
    }
    async getCampaignStats(userId) {
        const campaigns = await this.campaignRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 10 });
        return { total: campaigns.length, running: campaigns.filter(c => c.status === 'running').length, completed: campaigns.filter(c => c.status === 'completed').length, recent: campaigns };
    }
    async getCampaignDetail(campaignId) {
        const base = () => this.callRepo.createQueryBuilder('c').where('c.campaignId = :campaignId', { campaignId });
        const [total, completed] = await Promise.all([base().getCount(), base().andWhere('c.status = :s', { s: 'completed' }).getCount()]);
        const outcomes = await base().select('c.outcome', 'outcome').addSelect('COUNT(*)', 'count').groupBy('c.outcome').getRawMany();
        return { totalCalls: total, completedCalls: completed, outcomes };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(call_entity_1.Call)),
    __param(1, (0, typeorm_1.InjectRepository)(lead_entity_1.Lead)),
    __param(2, (0, typeorm_1.InjectRepository)(campaign_entity_1.Campaign)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        calling_service_1.CallingService,
        ai_service_1.AiService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map