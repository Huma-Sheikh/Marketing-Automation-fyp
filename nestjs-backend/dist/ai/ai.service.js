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
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const FormData = require("form-data");
let AiService = AiService_1 = class AiService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(AiService_1.name);
        this.STT_URL = config.get('STT_SERVICE_URL', 'http://localhost:8001');
        this.TTS_URL = config.get('TTS_SERVICE_URL', 'http://localhost:8001');
        this.LEADS_URL = config.get('LEADS_SERVICE_URL', 'http://localhost:8002');
        this.BUSINESS_URL = config.get('BUSINESS_SERVICE_URL', 'http://localhost:8003');
        this.LLM_URL = config.get('LLM_SERVICE_URL', 'http://localhost:8004');
    }
    async transcribeAudio(audioBuffer, language = 'en') {
        try {
            const form = new FormData();
            form.append('audio', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
            form.append('language', language);
            const response = await axios_1.default.post(`${this.STT_URL}/stt`, form, {
                headers: form.getHeaders(), timeout: 10000,
            });
            return response.data.text || '';
        }
        catch (err) {
            this.logger.warn('STT error: ' + err.message);
            return '';
        }
    }
    async synthesizeSpeech(text, language = 'en') {
        try {
            const response = await axios_1.default.post(`${this.TTS_URL}/tts`, { text, language }, { responseType: 'arraybuffer', timeout: 15000 });
            return Buffer.from(response.data);
        }
        catch (err) {
            this.logger.warn('TTS error: ' + err.message);
            return Buffer.alloc(0);
        }
    }
    async scrapeLeads(platform, query, maxResults = 100) {
        try {
            const response = await axios_1.default.post(`${this.LEADS_URL}/scrape`, { platform, query, max_results: maxResults }, { timeout: 120000 });
            return response.data.leads || [];
        }
        catch (err) {
            this.logger.warn('Lead scraper error: ' + err.message);
            return [];
        }
    }
    async scoreLead(features) {
        try {
            const response = await axios_1.default.post(`${this.LEADS_URL}/score`, features, { timeout: 5000 });
            return response.data.score || 50;
        }
        catch {
            return 50;
        }
    }
    async searchBusinesses(location, category) {
        try {
            const response = await axios_1.default.post(`${this.BUSINESS_URL}/search`, { location, category }, { timeout: 30000 });
            return response.data.businesses || [];
        }
        catch (err) {
            this.logger.warn('Business search error: ' + err.message);
            return [];
        }
    }
    async generateResponse(history, maxTokens = 150) {
        try {
            const response = await axios_1.default.post(`${this.LLM_URL}/chat`, { conversation_history: history, max_tokens: maxTokens }, { timeout: 8000 });
            return response.data.response || "I apologize, I had trouble responding. Could you repeat that?";
        }
        catch {
            return "I apologize, I had a technical difficulty. Can I call you back?";
        }
    }
    async qualifyLead(transcript) {
        try {
            const response = await axios_1.default.post(`${this.LLM_URL}/qualify`, { transcript }, { timeout: 10000 });
            return response.data;
        }
        catch {
            return { outcome: 'contacted', score: 50, notes: 'auto-qualified' };
        }
    }
    async checkHealth() {
        const services = [
            { name: 'STT/TTS', url: `${this.STT_URL}/health` },
            { name: 'Leads', url: `${this.LEADS_URL}/health` },
            { name: 'Business', url: `${this.BUSINESS_URL}/health` },
            { name: 'LLM', url: `${this.LLM_URL}/health` },
        ];
        const results = {};
        for (const svc of services) {
            try {
                await axios_1.default.get(svc.url, { timeout: 3000 });
                results[svc.name] = 'healthy';
            }
            catch {
                results[svc.name] = 'unavailable';
            }
        }
        return results;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiService);
//# sourceMappingURL=ai.service.js.map