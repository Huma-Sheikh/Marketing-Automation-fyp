"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bull_1 = require("@nestjs/bull");
const calling_service_1 = require("./calling.service");
const calling_gateway_1 = require("./calling.gateway");
const twiml_controller_1 = require("./twiml.controller");
const call_entity_1 = require("../database/entities/call.entity");
const lead_entity_1 = require("../database/entities/lead.entity");
const ai_module_1 = require("../ai/ai.module");
let CallingModule = class CallingModule {
};
exports.CallingModule = CallingModule;
exports.CallingModule = CallingModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([call_entity_1.Call, lead_entity_1.Lead]), bull_1.BullModule.registerQueue({ name: 'calling' }), ai_module_1.AiModule],
        providers: [calling_service_1.CallingService, calling_gateway_1.CallingGateway],
        controllers: [twiml_controller_1.TwimlController],
        exports: [calling_service_1.CallingService],
    })
], CallingModule);
//# sourceMappingURL=calling.module.js.map