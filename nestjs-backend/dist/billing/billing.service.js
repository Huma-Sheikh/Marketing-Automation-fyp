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
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
const subscription_entity_1 = require("../database/entities/subscription.entity");
const user_entity_1 = require("../database/entities/user.entity");
let BillingService = BillingService_1 = class BillingService {
    constructor(subRepo, userRepo, config) {
        this.subRepo = subRepo;
        this.userRepo = userRepo;
        this.config = config;
        this.logger = new common_1.Logger(BillingService_1.name);
        this.PLAN_PRICES = { starter: 'STRIPE_PRICE_STARTER', professional: 'STRIPE_PRICE_PRO', agency: 'STRIPE_PRICE_AGENCY' };
        this.PLAN_LIMITS = {
            free: { calls: 50, leads: 100, campaigns: 1 },
            starter: { calls: 500, leads: 2000, campaigns: 1 },
            professional: { calls: 2000, leads: 10000, campaigns: 5 },
            agency: { calls: 99999, leads: 99999, campaigns: 99 },
        };
    }
    getStripe() {
        const Stripe = require('stripe');
        return new Stripe(this.config.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    }
    async createCheckoutSession(userId, plan, successUrl, cancelUrl) {
        const priceId = this.config.get(this.PLAN_PRICES[plan]);
        if (!priceId)
            throw new common_1.BadRequestException('Plan not configured');
        const stripe = this.getStripe();
        const user = await this.userRepo.findOne({ where: { id: userId } });
        let sub = await this.subRepo.findOne({ where: { userId } });
        let customerId = sub?.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({ email: user.email, name: user.businessName, metadata: { userId } });
            customerId = customer.id;
        }
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            metadata: { userId, plan },
        });
        return { url: session.url };
    }
    async createBillingPortal(userId, returnUrl) {
        const sub = await this.subRepo.findOne({ where: { userId } });
        if (!sub?.stripeCustomerId)
            throw new common_1.BadRequestException('No subscription found');
        const stripe = this.getStripe();
        const session = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: returnUrl });
        return { url: session.url };
    }
    async handleWebhook(rawBody, signature) {
        const stripe = this.getStripe();
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, this.config.get('STRIPE_WEBHOOK_SECRET'));
        }
        catch (err) {
            throw new common_1.BadRequestException('Invalid webhook signature');
        }
        this.logger.log(`Stripe webhook: ${event.type}`);
        switch (event.type) {
            case 'checkout.session.completed': {
                const s = event.data.object;
                const { userId, plan } = s.metadata;
                const stripeSub = await stripe.subscriptions.retrieve(s.subscription);
                await this.activateSubscription(userId, plan, s.customer, s.subscription, new Date(stripeSub.current_period_end * 1000));
                break;
            }
            case 'invoice.payment_succeeded':
                await this.subRepo.update({ stripeCustomerId: event.data.object.customer }, { callsThisMonth: 0 });
                break;
            case 'invoice.payment_failed':
                await this.subRepo.update({ stripeCustomerId: event.data.object.customer }, { status: 'past_due' });
                break;
            case 'customer.subscription.deleted':
                await this.subRepo.update({ stripeCustomerId: event.data.object.customer }, { plan: 'free', status: 'canceled' });
                break;
        }
        return { received: true };
    }
    async activateSubscription(userId, plan, customerId, subscriptionId, periodEnd) {
        let sub = await this.subRepo.findOne({ where: { userId } });
        if (!sub)
            sub = this.subRepo.create({ userId });
        sub.stripeCustomerId = customerId;
        sub.stripeSubscriptionId = subscriptionId;
        sub.plan = plan;
        sub.status = 'active';
        sub.currentPeriodEnd = periodEnd;
        await this.subRepo.save(sub);
    }
    async getSubscription(userId) {
        const sub = await this.subRepo.findOne({ where: { userId } });
        const limits = this.PLAN_LIMITS[sub?.plan || 'free'];
        return { sub, limits };
    }
    async canMakeCall(userId) {
        const sub = await this.subRepo.findOne({ where: { userId } });
        if (!sub || !['active', 'trialing'].includes(sub.status))
            return false;
        return sub.callsThisMonth < (this.PLAN_LIMITS[sub.plan]?.calls || 0);
    }
    async incrementCallCount(userId) {
        await this.subRepo.increment({ userId }, 'callsThisMonth', 1);
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(subscription_entity_1.Subscription)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        config_1.ConfigService])
], BillingService);
//# sourceMappingURL=billing.service.js.map