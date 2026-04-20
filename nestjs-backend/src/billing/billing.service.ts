import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Subscription } from '../database/entities/subscription.entity';
import { User } from '../database/entities/user.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly PLAN_PRICES = { starter: 'STRIPE_PRICE_STARTER', professional: 'STRIPE_PRICE_PRO', agency: 'STRIPE_PRICE_AGENCY' };
  private readonly PLAN_LIMITS = {
    free:         { calls: 50,    leads: 100,   campaigns: 1 },
    starter:      { calls: 500,   leads: 2000,  campaigns: 1 },
    professional: { calls: 2000,  leads: 10000, campaigns: 5 },
    agency:       { calls: 99999, leads: 99999, campaigns: 99 },
  };

  constructor(
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private config: ConfigService,
  ) {}

  private getStripe() {
    const Stripe = require('stripe');
    return new Stripe(this.config.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
  }

  async createCheckoutSession(userId: string, plan: string, successUrl: string, cancelUrl: string) {
    const priceId = this.config.get(this.PLAN_PRICES[plan]);
    if (!priceId) throw new BadRequestException('Plan not configured');
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

  async createBillingPortal(userId: string, returnUrl: string) {
    const sub = await this.subRepo.findOne({ where: { userId } });
    if (!sub?.stripeCustomerId) throw new BadRequestException('No subscription found');
    const stripe = this.getStripe();
    const session = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: returnUrl });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.getStripe();
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.config.get('STRIPE_WEBHOOK_SECRET'));
    } catch (err) {
      throw new BadRequestException('Invalid webhook signature');
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

  private async activateSubscription(userId: string, plan: string, customerId: string, subscriptionId: string, periodEnd: Date) {
    let sub = await this.subRepo.findOne({ where: { userId } });
    if (!sub) sub = this.subRepo.create({ userId });
    sub.stripeCustomerId = customerId;
    sub.stripeSubscriptionId = subscriptionId;
    sub.plan = plan;
    sub.status = 'active';
    sub.currentPeriodEnd = periodEnd;
    await this.subRepo.save(sub);
  }

  async getSubscription(userId: string) {
    const sub = await this.subRepo.findOne({ where: { userId } });
    const limits = this.PLAN_LIMITS[sub?.plan || 'free'];
    return { sub, limits };
  }

  async canMakeCall(userId: string): Promise<boolean> {
    const sub = await this.subRepo.findOne({ where: { userId } });
    if (!sub || !['active', 'trialing'].includes(sub.status)) return false;
    return sub.callsThisMonth < (this.PLAN_LIMITS[sub.plan]?.calls || 0);
  }

  async incrementCallCount(userId: string) {
    await this.subRepo.increment({ userId }, 'callsThisMonth', 1);
  }
}
