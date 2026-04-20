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
exports.WhitelabelService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const agency_entity_1 = require("../database/entities/agency.entity");
let WhitelabelService = class WhitelabelService {
    constructor(agencyRepo) {
        this.agencyRepo = agencyRepo;
    }
    async createAgency(ownerId, dto) {
        const a = this.agencyRepo.create({ ownerId, agencyName: dto.agencyName, customDomain: dto.customDomain, primaryColor: dto.primaryColor || '#2563EB', logoUrl: dto.logoUrl, callerIdName: dto.callerIdName || dto.agencyName, limits: dto.limits || { maxCalls: 1000, maxLeads: 5000, maxCampaigns: 10, maxUsers: 5 }, status: 'active' });
        return this.agencyRepo.save(a);
    }
    async getBrandingByDomain(domain) {
        const agency = await this.agencyRepo.findOne({ where: { customDomain: domain, status: 'active' } });
        if (!agency)
            return { agencyName: 'Marketing Platform', primaryColor: '#1F3864', logoUrl: null, isWhiteLabel: false };
        return { agencyName: agency.agencyName, primaryColor: agency.primaryColor, logoUrl: agency.logoUrl, callerIdName: agency.callerIdName, isWhiteLabel: true };
    }
    async getAgencies(ownerId) { return this.agencyRepo.find({ where: { ownerId } }); }
    async updateAgency(id, ownerId, updates) {
        const a = await this.agencyRepo.findOne({ where: { id, ownerId } });
        if (!a)
            throw new common_1.NotFoundException('Agency not found');
        Object.assign(a, updates);
        return this.agencyRepo.save(a);
    }
    async deleteAgency(id) { await this.agencyRepo.delete(id); return { deleted: true }; }
};
exports.WhitelabelService = WhitelabelService;
exports.WhitelabelService = WhitelabelService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(agency_entity_1.Agency)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], WhitelabelService);
//# sourceMappingURL=whitelabel.service.js.map