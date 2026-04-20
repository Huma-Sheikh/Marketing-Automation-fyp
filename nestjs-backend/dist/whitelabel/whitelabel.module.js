"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhitelabelModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const whitelabel_service_1 = require("./whitelabel.service");
const whitelabel_controller_1 = require("./whitelabel.controller");
const agency_entity_1 = require("../database/entities/agency.entity");
let WhitelabelModule = class WhitelabelModule {
};
exports.WhitelabelModule = WhitelabelModule;
exports.WhitelabelModule = WhitelabelModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([agency_entity_1.Agency])],
        providers: [whitelabel_service_1.WhitelabelService],
        controllers: [whitelabel_controller_1.WhitelabelController],
        exports: [whitelabel_service_1.WhitelabelService],
    })
], WhitelabelModule);
//# sourceMappingURL=whitelabel.module.js.map