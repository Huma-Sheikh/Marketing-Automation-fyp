"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SmsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsService = void 0;
const common_1 = require("@nestjs/common");
let SmsService = SmsService_1 = class SmsService {
    constructor() {
        this.logger = new common_1.Logger(SmsService_1.name);
    }
    async sendSms(to, message) {
        try {
            const twilio = require('twilio');
            const client = new twilio.Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const msg = await client.messages.create({
                body: message.substring(0, 160),
                from: process.env.TWILIO_PHONE_NUMBER,
                to,
            });
            this.logger.log(`SMS sent to ${to}: ${msg.sid}`);
            return true;
        }
        catch (err) {
            this.logger.error(`SMS failed to ${to}: ${err.message}`);
            return false;
        }
    }
    async sendBulkSms(leads, template) {
        let sent = 0, failed = 0;
        for (const lead of leads) {
            if (!lead.phone) {
                failed++;
                continue;
            }
            const message = template
                .replace('{{firstName}}', lead.firstName || 'there')
                .replace('{{company}}', lead.company || '');
            const ok = await this.sendSms(lead.phone, message);
            ok ? sent++ : failed++;
            await new Promise(r => setTimeout(r, 1000));
        }
        return { sent, failed };
    }
};
exports.SmsService = SmsService;
exports.SmsService = SmsService = SmsService_1 = __decorate([
    (0, common_1.Injectable)()
], SmsService);
//# sourceMappingURL=sms.service.js.map