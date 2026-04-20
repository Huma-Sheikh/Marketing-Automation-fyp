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
var CallingGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallingGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const calling_service_1 = require("./calling.service");
const ai_service_1 = require("../ai/ai.service");
let CallingGateway = CallingGateway_1 = class CallingGateway {
    constructor(callingService, aiService) {
        this.callingService = callingService;
        this.aiService = aiService;
        this.logger = new common_1.Logger(CallingGateway_1.name);
    }
    handleConnection(client) { this.logger.log(`WS connected: ${client.id}`); }
    handleDisconnect(client) { this.logger.log(`WS disconnected: ${client.id}`); }
    handleConnected(client, data) {
        client.data.callSid = data?.callSid;
    }
    async handleStart(client, data) {
        const callSid = data?.start?.callSid;
        client.data.callSid = callSid;
        client.data.streamSid = data?.start?.streamSid;
        this.logger.log(`Stream started: ${callSid}`);
        await this.sendGreeting(client);
    }
    async handleMedia(client, data) {
        const callSid = client.data.callSid;
        if (!callSid || !data?.media?.payload)
            return;
        const responseAudio = await this.callingService.handleAudioChunk(callSid, data.media.payload, this.aiService);
        if (responseAudio && responseAudio.length > 0) {
            client.emit('media', {
                event: 'media',
                streamSid: client.data.streamSid,
                media: { payload: responseAudio.toString('base64') },
            });
        }
    }
    async handleStop(client, data) {
        const callSid = client.data.callSid;
        const duration = data?.stop?.duration || 0;
        if (callSid)
            await this.callingService.handleCallComplete(callSid, duration, this.aiService);
    }
    async sendGreeting(client) {
        try {
            const greeting = 'Hello! This is an automated call. How are you today?';
            const audio = await this.aiService.synthesizeSpeech(greeting);
            if (audio.length > 0) {
                client.emit('media', {
                    event: 'media',
                    streamSid: client.data.streamSid,
                    media: { payload: audio.toString('base64') },
                });
            }
        }
        catch (err) {
            this.logger.warn('Greeting TTS failed: ' + err.message);
        }
    }
};
exports.CallingGateway = CallingGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], CallingGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('connected'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], CallingGateway.prototype, "handleConnected", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CallingGateway.prototype, "handleStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('media'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CallingGateway.prototype, "handleMedia", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('stop'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], CallingGateway.prototype, "handleStop", null);
exports.CallingGateway = CallingGateway = CallingGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/audio-stream', cors: { origin: '*' } }),
    __metadata("design:paramtypes", [calling_service_1.CallingService, ai_service_1.AiService])
], CallingGateway);
//# sourceMappingURL=calling.gateway.js.map