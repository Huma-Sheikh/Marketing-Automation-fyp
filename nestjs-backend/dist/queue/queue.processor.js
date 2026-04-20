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
var CallingQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallingQueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const calling_service_1 = require("../calling/calling.service");
let CallingQueueProcessor = CallingQueueProcessor_1 = class CallingQueueProcessor {
    constructor(callingService) {
        this.callingService = callingService;
        this.logger = new common_1.Logger(CallingQueueProcessor_1.name);
    }
    async processDial(job) {
        const { leadId, phoneNumber, campaignId, settings } = job.data;
        const hour = new Date().getHours();
        const start = settings?.callStartHour || 9;
        const end = settings?.callEndHour || 18;
        if (hour < start || hour >= end) {
            this.logger.log(`Outside calling hours (${hour}h). Delaying.`);
            return { skipped: true, reason: 'outside_hours' };
        }
        try {
            const callSid = await this.callingService.initiateCall(leadId, phoneNumber, campaignId);
            return { callSid, status: 'initiated' };
        }
        catch (err) {
            this.logger.error(`Failed to dial ${phoneNumber}: ${err.message}`);
            throw err;
        }
    }
    onActive(job) { this.logger.debug(`Dialing ${job.data.phoneNumber}`); }
    onCompleted(job) { this.logger.debug(`Call job ${job.id} complete`); }
    onFailed(job, err) { this.logger.error(`Call job ${job.id} failed: ${err.message}`); }
};
exports.CallingQueueProcessor = CallingQueueProcessor;
__decorate([
    (0, bull_1.Process)({ name: 'dial-lead', concurrency: 60 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CallingQueueProcessor.prototype, "processDial", null);
__decorate([
    (0, bull_1.OnQueueActive)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CallingQueueProcessor.prototype, "onActive", null);
__decorate([
    (0, bull_1.OnQueueCompleted)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CallingQueueProcessor.prototype, "onCompleted", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], CallingQueueProcessor.prototype, "onFailed", null);
exports.CallingQueueProcessor = CallingQueueProcessor = CallingQueueProcessor_1 = __decorate([
    (0, bull_1.Processor)('calling'),
    __metadata("design:paramtypes", [calling_service_1.CallingService])
], CallingQueueProcessor);
//# sourceMappingURL=queue.processor.js.map