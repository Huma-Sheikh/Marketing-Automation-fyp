"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const campaign_service_1 = require("./campaign.service");
const campaign_controller_1 = require("./campaign.controller");
const campaign_entity_1 = require("../database/entities/campaign.entity");
const lead_entity_1 = require("../database/entities/lead.entity");
const calling_module_1 = require("../calling/calling.module");
const email_module_1 = require("../email/email.module");
const sms_module_1 = require("../sms/sms.module");
let CampaignModule = class CampaignModule {
};
exports.CampaignModule = CampaignModule;
exports.CampaignModule = CampaignModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([campaign_entity_1.Campaign, lead_entity_1.Lead]), calling_module_1.CallingModule, email_module_1.EmailModule, sms_module_1.SmsModule],
        providers: [campaign_service_1.CampaignService],
        controllers: [campaign_controller_1.CampaignController],
        exports: [campaign_service_1.CampaignService],
    })
], CampaignModule);
//# sourceMappingURL=campaign.module.js.map