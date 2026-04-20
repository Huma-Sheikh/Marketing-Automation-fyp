"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
let EmailService = EmailService_1 = class EmailService {
    constructor() {
        this.logger = new common_1.Logger(EmailService_1.name);
    }
    async sendCampaignEmail(options) {
        try {
            const { Resend } = await Promise.resolve().then(() => require('resend'));
            const resend = new Resend(process.env.RESEND_API_KEY);
            let body = options.template;
            if (options.variables) {
                for (const [k, v] of Object.entries(options.variables)) {
                    body = body.replace(new RegExp(`{{${k}}}`, 'g'), v);
                }
            }
            await resend.emails.send({
                from: process.env.EMAIL_FROM || 'noreply@example.com',
                to: options.to,
                subject: options.subject,
                html: `<div style="font-family:Arial;max-width:600px;margin:0 auto"><div style="background:#1F3864;color:white;padding:20px;text-align:center"><h2>Marketing Platform</h2></div><div style="padding:30px">${body.replace(/\n/g, '<br>')}</div></div>`,
            });
            this.logger.log(`Email sent to ${options.to}`);
            return true;
        }
        catch (err) {
            this.logger.error(`Email failed to ${options.to}: ${err.message}`);
            return false;
        }
    }
    async sendBulkEmails(leads, subject, template) {
        let sent = 0, failed = 0;
        for (const lead of leads) {
            if (!lead.email) {
                failed++;
                continue;
            }
            const ok = await this.sendCampaignEmail({
                to: lead.email,
                leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
                subject,
                template,
                variables: {
                    firstName: lead.firstName || 'there',
                    lastName: lead.lastName || '',
                    company: lead.company || 'your company',
                    jobTitle: lead.jobTitle || '',
                },
            });
            ok ? sent++ : failed++;
            await new Promise(r => setTimeout(r, 150));
        }
        return { sent, failed };
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)()
], EmailService);
//# sourceMappingURL=email.service.js.map