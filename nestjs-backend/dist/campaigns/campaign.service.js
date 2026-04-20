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
var CampaignService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const campaign_entity_1 = require("../database/entities/campaign.entity");
const lead_entity_1 = require("../database/entities/lead.entity");
const calling_service_1 = require("../calling/calling.service");
const email_service_1 = require("../email/email.service");
const sms_service_1 = require("../sms/sms.service");
let CampaignService = CampaignService_1 = class CampaignService {
    constructor(campaignRepo, leadRepo, callingService, emailService, smsService) {
        this.campaignRepo = campaignRepo;
        this.leadRepo = leadRepo;
        this.callingService = callingService;
        this.emailService = emailService;
        this.smsService = smsService;
        this.logger = new common_1.Logger(CampaignService_1.name);
    }
    async createCampaign(userId, dto) {
        const c = this.campaignRepo.create({ userId, name: dto.name, type: dto.type, status: 'draft', settings: dto.settings || {} });
        return this.campaignRepo.save(c);
    }
    async startCampaign(campaignId, userId) {
        const campaign = await this.campaignRepo.findOne({ where: { id: campaignId, userId } });
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        if (campaign.status === 'running')
            return { message: 'Already running' };
        const leads = await this.leadRepo.find({ where: { userId, status: 'new' } });
        if (!leads.length)
            throw new common_1.NotFoundException('No new leads available');
        await this.campaignRepo.update(campaignId, { status: 'running', totalLeads: leads.length });
        const settings = campaign.settings;
        const results = {};
        if (campaign.type === 'call' || campaign.type === 'mixed') {
            results.calling = await this.callingService.startCampaignCalls(campaignId, leads.filter(l => l.phone), settings);
        }
        if (campaign.type === 'email' || campaign.type === 'mixed') {
            results.email = await this.emailService.sendBulkEmails(leads.filter(l => l.email), settings?.emailSubject || 'Quick question about your business', settings?.emailTemplate || 'Hi {{firstName}}, I wanted to reach out...');
        }
        if (campaign.type === 'sms' || campaign.type === 'mixed') {
            results.sms = await this.smsService.sendBulkSms(leads.filter(l => l.phone), settings?.smsTemplate || 'Hi {{firstName}}, this is a quick message from us.');
        }
        this.logger.log(`Campaign ${campaignId} started`);
        return { message: 'Campaign started', campaignId, results };
    }
    async stopCampaign(campaignId) {
        await this.campaignRepo.update(campaignId, { status: 'paused' });
        await this.callingService.stopCampaign(campaignId);
        return { message: 'Campaign stopped' };
    }
    async getCampaigns(userId) {
        return this.campaignRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    }
    async getCampaignStats(campaignId) {
        const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
        return { campaign, activeCalls: this.callingService.getActiveCallCount() };
    }
    async deleteCampaign(campaignId) {
        await this.campaignRepo.delete(campaignId);
        return { deleted: true };
    }
};
exports.CampaignService = CampaignService;
exports.CampaignService = CampaignService = CampaignService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(campaign_entity_1.Campaign)),
    __param(1, (0, typeorm_1.InjectRepository)(lead_entity_1.Lead)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        calling_service_1.CallingService,
        email_service_1.EmailService,
        sms_service_1.SmsService])
], CampaignService);
//# sourceMappingURL=campaign.service.js.map