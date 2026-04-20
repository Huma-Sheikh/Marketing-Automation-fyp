"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const bull_1 = require("@nestjs/bull");
const ai_module_1 = require("./ai/ai.module");
const auth_module_1 = require("./auth/auth.module");
const leads_module_1 = require("./leads/leads.module");
const business_module_1 = require("./business/business.module");
const campaign_module_1 = require("./campaigns/campaign.module");
const calling_module_1 = require("./calling/calling.module");
const email_module_1 = require("./email/email.module");
const sms_module_1 = require("./sms/sms.module");
const analytics_module_1 = require("./analytics/analytics.module");
const whitelabel_module_1 = require("./whitelabel/whitelabel.module");
const billing_module_1 = require("./billing/billing.module");
const queue_module_1 = require("./queue/queue.module");
const user_entity_1 = require("./database/entities/user.entity");
const lead_entity_1 = require("./database/entities/lead.entity");
const campaign_entity_1 = require("./database/entities/campaign.entity");
const call_entity_1 = require("./database/entities/call.entity");
const agency_entity_1 = require("./database/entities/agency.entity");
const subscription_entity_1 = require("./database/entities/subscription.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    type: 'postgres',
                    host: config.get('DB_HOST', 'localhost'),
                    port: +config.get('DB_PORT', '5432'),
                    username: config.get('DB_USERNAME', 'marketing_user'),
                    password: config.get('DB_PASSWORD', 'marketing_pass'),
                    database: config.get('DB_NAME', 'marketing_platform'),
                    entities: [user_entity_1.User, lead_entity_1.Lead, campaign_entity_1.Campaign, call_entity_1.Call, agency_entity_1.Agency, subscription_entity_1.Subscription],
                    synchronize: true,
                    logging: false,
                }),
            }),
            bull_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    redis: {
                        host: config.get('REDIS_HOST', 'localhost'),
                        port: +config.get('REDIS_PORT', '6379'),
                    },
                }),
            }),
            ai_module_1.AiModule, auth_module_1.AuthModule, leads_module_1.LeadsModule, business_module_1.BusinessModule, campaign_module_1.CampaignModule,
            calling_module_1.CallingModule, email_module_1.EmailModule, sms_module_1.SmsModule, analytics_module_1.AnalyticsModule, whitelabel_module_1.WhitelabelModule, billing_module_1.BillingModule,
            queue_module_1.QueueModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map