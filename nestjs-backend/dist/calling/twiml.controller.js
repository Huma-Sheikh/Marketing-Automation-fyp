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
exports.TwimlController = void 0;
const common_1 = require("@nestjs/common");
let TwimlController = class TwimlController {
    handleOutbound(leadId, campaignId, res) {
        const baseUrl = (process.env.BASE_URL || 'https://yourdomain.com').replace('https://', '');
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Please hold for just a moment.</Say>
  <Connect>
    <Stream url="wss://${baseUrl}/audio-stream" name="call-${leadId}">
      <Parameter name="leadId" value="${leadId}"/>
      <Parameter name="campaignId" value="${campaignId}"/>
    </Stream>
  </Connect>
</Response>`;
        res.type('text/xml').send(twiml);
    }
    handleInbound(res) {
        const baseUrl = (process.env.BASE_URL || 'https://yourdomain.com').replace('https://', '');
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Our AI assistant will be with you shortly.</Say>
  <Connect>
    <Stream url="wss://${baseUrl}/audio-stream"/>
  </Connect>
</Response>`;
        res.type('text/xml').send(twiml);
    }
    handleStatus(body) {
        console.log('Call status:', body.CallSid, body.CallStatus, body.CallDuration + 's');
        return { received: true };
    }
};
exports.TwimlController = TwimlController;
__decorate([
    (0, common_1.Post)('outbound'),
    __param(0, (0, common_1.Query)('leadId')),
    __param(1, (0, common_1.Query)('campaignId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TwimlController.prototype, "handleOutbound", null);
__decorate([
    (0, common_1.Post)('inbound'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TwimlController.prototype, "handleInbound", null);
__decorate([
    (0, common_1.Post)('status'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TwimlController.prototype, "handleStatus", null);
exports.TwimlController = TwimlController = __decorate([
    (0, common_1.Controller)('twiml')
], TwimlController);
//# sourceMappingURL=twiml.controller.js.map