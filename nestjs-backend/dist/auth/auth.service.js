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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../database/entities/user.entity");
const subscription_entity_1 = require("../database/entities/subscription.entity");
const bcrypt = require("bcryptjs");
let AuthService = class AuthService {
    constructor(userRepo, subRepo, jwtService) {
        this.userRepo = userRepo;
        this.subRepo = subRepo;
        this.jwtService = jwtService;
    }
    async register(email, password, businessName) {
        const exists = await this.userRepo.findOne({ where: { email } });
        if (exists)
            throw new common_1.ConflictException('Email already registered');
        const hash = await bcrypt.hash(password, 12);
        const user = await this.userRepo.save(this.userRepo.create({ email, passwordHash: hash, businessName }));
        await this.subRepo.save(this.subRepo.create({ user: { id: user.id }, plan: 'free', status: 'active' }));
        const token = this.jwtService.sign({ sub: user.id, email: user.email });
        return { token, user: { id: user.id, email: user.email, businessName: user.businessName } };
    }
    async login(email, password) {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const token = this.jwtService.sign({ sub: user.id, email: user.email });
        return { token, user: { id: user.id, email: user.email, businessName: user.businessName } };
    }
    async getProfile(userId) {
        return this.userRepo.findOne({ where: { id: userId } });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(subscription_entity_1.Subscription)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map