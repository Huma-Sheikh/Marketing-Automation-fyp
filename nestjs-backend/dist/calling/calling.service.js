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
var CallingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bull_1 = require("@nestjs/bull");
const config_1 = require("@nestjs/config");
const call_entity_1 = require("../database/entities/call.entity");
const lead_entity_1 = require("../database/entities/lead.entity");
let CallingService = CallingService_1 = class CallingService {
    constructor(callRepo, leadRepo, callingQueue, config) {
        this.callRepo = callRepo;
        this.leadRepo = leadRepo;
        this.callingQueue = callingQueue;
        this.config = config;
        this.logger = new common_1.Logger(CallingService_1.name);
        this.activeConversations = new Map();
        this.twilioClient = null;
        this.fromNumber = config.get('TWILIO_PHONE_NUMBER', '');
        try {
            const twilio = require('twilio');
            this.twilioClient = new twilio.Twilio(config.get('TWILIO_ACCOUNT_SID'), config.get('TWILIO_AUTH_TOKEN'));
        }
        catch (e) {
            this.logger.warn('Twilio client init failed - check credentials');
        }
    }
    async startCampaignCalls(campaignId, leads, settings) {
        const maxConcurrent = settings?.maxConcurrentCalls || 60;
        let queued = 0;
        for (const lead of leads) {
            if (!lead.phone)
                continue;
            await this.callingQueue.add('dial-lead', {
                leadId: lead.id, phoneNumber: lead.phone, campaignId,
                leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(), settings,
            }, { attempts: 2, backoff: 30000, removeOnComplete: true });
            queued++;
        }
        this.logger.log(`Queued ${queued} calls for campaign ${campaignId}`);
        return { queued, maxConcurrent };
    }
    async initiateCall(leadId, phoneNumber, campaignId) {
        const baseUrl = this.config.get('BASE_URL', 'https://yourdomain.com');
        if (!this.twilioClient)
            throw new Error('Twilio not configured');
        const call = await this.twilioClient.calls.create({
            to: phoneNumber,
            from: this.fromNumber,
            url: `${baseUrl}/api/twiml/outbound?leadId=${leadId}&campaignId=${campaignId}`,
            statusCallback: `${baseUrl}/api/twiml/status`,
            statusCallbackMethod: 'POST',
            machineDetection: 'DetectMessageEnd',
            timeout: 30,
        });
        await this.callRepo.save(this.callRepo.create({
            leadId, campaignId, twilioCallSid: call.sid, status: 'initiated',
        }));
        this.activeConversations.set(call.sid, []);
        this.logger.log(`Call initiated: ${call.sid} to ${phoneNumber}`);
        return call.sid;
    }
    async handleAudioChunk(callSid, audioBase64, aiService) {
        try {
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            const transcript = await aiService.transcribeAudio(audioBuffer);
            if (!transcript || transcript.trim().length < 3)
                return null;
            const history = this.activeConversations.get(callSid) || [];
            history.push({ role: 'user', content: transcript });
            const aiResponse = await aiService.generateResponse(history);
            history.push({ role: 'assistant', content: aiResponse });
            this.activeConversations.set(callSid, history);
            return await aiService.synthesizeSpeech(aiResponse);
        }
        catch (err) {
            this.logger.error(`Audio processing error for ${callSid}: ${err.message}`);
            return null;
        }
    }
    async handleCallComplete(callSid, duration, aiService) {
        const history = this.activeConversations.get(callSid);
        if (history && history.length > 0) {
            const transcriptText = history.map(m => (m.role === 'user' ? 'Lead' : 'Agent') + ': ' + m.content).join('\n');
            const qualification = await aiService.qualifyLead(transcriptText);
            await this.callRepo.update({ twilioCallSid: callSid }, {
                status: 'completed', durationSeconds: duration,
                transcript: transcriptText, outcome: qualification.outcome,
            });
            const call = await this.callRepo.findOne({ where: { twilioCallSid: callSid } });
            if (call?.leadId) {
                await this.leadRepo.update(call.leadId, { status: qualification.outcome || 'contacted' });
            }
        }
        this.activeConversations.delete(callSid);
    }
    getActiveCallCount() { return this.activeConversations.size; }
    async stopCampaign(campaignId) {
        await this.callingQueue.pause();
        const jobs = await this.callingQueue.getJobs(['waiting', 'delayed']);
        for (const job of jobs) {
            if (job.data.campaignId === campaignId)
                await job.remove();
        }
        await this.callingQueue.resume();
    }
};
exports.CallingService = CallingService;
exports.CallingService = CallingService = CallingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(call_entity_1.Call)),
    __param(1, (0, typeorm_1.InjectRepository)(lead_entity_1.Lead)),
    __param(2, (0, bull_1.InjectQueue)('calling')),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository, Object, config_1.ConfigService])
], CallingService);
//# sourceMappingURL=calling.service.js.map