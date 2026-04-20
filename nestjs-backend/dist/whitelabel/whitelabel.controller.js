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
exports.WhitelabelController = void 0;
const common_1 = require("@nestjs/common");
const whitelabel_service_1 = require("./whitelabel.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let WhitelabelController = class WhitelabelController {
    constructor(whitelabelService) {
        this.whitelabelService = whitelabelService;
    }
    getBranding(domain) { return this.whitelabelService.getBrandingByDomain(domain || ''); }
    create(body, req) { return this.whitelabelService.createAgency(req.user.id, body); }
    getAll(req) { return this.whitelabelService.getAgencies(req.user.id); }
    update(id, body, req) { return this.whitelabelService.updateAgency(id, req.user.id, body); }
    remove(id) { return this.whitelabelService.deleteAgency(id); }
};
exports.WhitelabelController = WhitelabelController;
__decorate([
    (0, common_1.Get)('branding'),
    __param(0, (0, common_1.Query)('domain')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WhitelabelController.prototype, "getBranding", null);
__decorate([
    (0, common_1.Post)('agencies'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WhitelabelController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('agencies'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WhitelabelController.prototype, "getAll", null);
__decorate([
    (0, common_1.Put)('agencies/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], WhitelabelController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('agencies/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WhitelabelController.prototype, "remove", null);
exports.WhitelabelController = WhitelabelController = __decorate([
    (0, common_1.Controller)('whitelabel'),
    __metadata("design:paramtypes", [whitelabel_service_1.WhitelabelService])
], WhitelabelController);
//# sourceMappingURL=whitelabel.controller.js.map