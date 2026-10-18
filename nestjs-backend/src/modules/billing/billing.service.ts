import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../database/entities/subscription.entity';
import { User } from '../../database/entities/user.entity';
import {
  ACTIVE_SUBSCRIPTION_STATUSES, PLAN_LIMITS, PLAN_PRICE_ENV, PaidPlan, STRIPE_API_VERSION,
} from './billing.constants';

/** Stripe subscriptions and the per-plan call quota. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: any = null;

  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  /** Lazily built so the app boots (and free plans work) without Stripe keys. */
  private getStripe() {
    if (this.stripe) return this.stripe;
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key) throw new ServiceUnavailableException('Billing is not configured on this server (STRIPE_SECRET_KEY is missing)');
    const Stripe = require('stripe');
    this.stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    return this.stripe;
  }

  async createCheckoutSession(userId: string, plan: string, successUrl: string, cancelUrl: string) {
    const priceId = this.config.get(PLAN_PRICE_ENV[plan as PaidPlan]);
    if (!priceId) throw new BadRequestException('Plan not configured');
    const stripe = this.getStripe();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const sub = await this.subRepo.findOne({ where: { userId } });
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
    const session = await this.getStripe().billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: returnUrl });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const stripe = this.getStripe();
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.config.get('STRIPE_WEBHOOK_SECRET'));
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Stripe webhook: ${event.type}`);
    const customer = event.data?.object?.customer;
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, plan } = session.metadata;
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        await this.activateSubscription(userId, plan, session.customer, session.subscription, new Date(stripeSub.current_period_end * 1000));
        break;
      }
      case 'invoice.payment_succeeded':
        // A paid invoice opens a new billing period: reset the monthly quota.
        await this.subRepo.update({ stripeCustomerId: customer }, { callsThisMonth: 0 });
        break;
      case 'invoice.payment_failed':
        await this.subRepo.update({ stripeCustomerId: customer }, { status: 'past_due' });
        break;
      case 'customer.subscription.deleted':
        await this.subRepo.update({ stripeCustomerId: customer }, { plan: 'free', status: 'canceled' });
        break;
    }
    return { received: true };
  }

  private async activateSubscription(userId: string, plan: string, customerId: string, subscriptionId: string, periodEnd: Date) {
    const sub = (await this.subRepo.findOne({ where: { userId } })) ?? this.subRepo.create({ userId });
    Object.assign(sub, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan,
      status: 'active',
      currentPeriodEnd: periodEnd,
    });
    await this.subRepo.save(sub);
  }

  async getSubscription(userId: string) {
    const sub = await this.subRepo.findOne({ where: { userId } });
    const limits = PLAN_LIMITS[sub?.plan || 'free'];
    return { sub, limits };
  }

  async canMakeCall(userId: string): Promise<boolean> {
    const sub = await this.subRepo.findOne({ where: { userId } });
    if (!sub || !ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status)) return false;
    return sub.callsThisMonth < (PLAN_LIMITS[sub.plan]?.calls || 0);
  }

  async incrementCallCount(userId: string) {
    await this.subRepo.increment({ userId }, 'callsThisMonth', 1);
  }
}
