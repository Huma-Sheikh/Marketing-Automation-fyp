import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Subscription } from '../database/entities/subscription.entity';
import { User } from '../database/entities/user.entity';

// ─── Stripe mock ──────────────────────────────────────────────────────────────
const mockStripeSession = { url: 'https://checkout.stripe.com/pay/test' };
const mockPortalSession = { url: 'https://billing.stripe.com/portal/test' };
const mockCustomer = { id: 'cus_test123' };
const mockStripeSub = { current_period_end: Math.floor(Date.now() / 1000) + 86400 };

const mockStripe = {
  customers: { create: jest.fn().mockResolvedValue(mockCustomer) },
  checkout: { sessions: { create: jest.fn().mockResolvedValue(mockStripeSession) } },
  billingPortal: { sessions: { create: jest.fn().mockResolvedValue(mockPortalSession) } },
  subscriptions: { retrieve: jest.fn().mockResolvedValue(mockStripeSub) },
  webhooks: { constructEvent: jest.fn() },
};

jest.mock('stripe', () => jest.fn().mockImplementation(() => mockStripe));

const mockSubRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  increment: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, def?: string) => {
    const map: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_xxx',
      STRIPE_PRICE_STARTER: 'price_starter',
      STRIPE_PRICE_PRO: 'price_pro',
      STRIPE_PRICE_AGENCY: 'price_agency',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    };
    return map[key] ?? def;
  }),
};

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();

    // Re-attach mock implementations after clearAllMocks
    mockStripe.customers.create.mockResolvedValue(mockCustomer);
    mockStripe.checkout.sessions.create.mockResolvedValue(mockStripeSession);
    mockStripe.billingPortal.sessions.create.mockResolvedValue(mockPortalSession);
    mockStripe.subscriptions.retrieve.mockResolvedValue(mockStripeSub);
    mockConfig.get.mockImplementation((key: string, def?: string) => {
      const map: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STRIPE_PRICE_STARTER: 'price_starter',
        STRIPE_PRICE_PRO: 'price_pro',
        STRIPE_PRICE_AGENCY: 'price_agency',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      };
      return map[key] ?? def;
    });
  });

  // ─── createCheckoutSession ────────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('throws BadRequestException for unknown plan', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await expect(
        service.createCheckoutSession('u1', 'enterprise', 'http://success', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new Stripe customer when none exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ email: 'test@test.com', businessName: 'Test' });
      mockSubRepo.findOne.mockResolvedValue(null);
      mockConfig.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          STRIPE_SECRET_KEY: 'sk_test_xxx',
          STRIPE_PRICE_STARTER: 'price_starter',
        };
        return map[key];
      });

      await service.createCheckoutSession('u1', 'starter', 'http://s', 'http://c');

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@test.com', metadata: { userId: 'u1' } }),
      );
    });

    it('reuses existing Stripe customerId from subscription', async () => {
      mockUserRepo.findOne.mockResolvedValue({ email: 'x@x.com', businessName: 'X' });
      mockSubRepo.findOne.mockResolvedValue({ stripeCustomerId: 'cus_existing' });
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_xxx';
        if (key === 'STRIPE_PRICE_STARTER') return 'price_starter';
      });

      await service.createCheckoutSession('u1', 'starter', 'http://s', 'http://c');

      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('returns checkout session URL', async () => {
      mockUserRepo.findOne.mockResolvedValue({ email: 'a@a.com', businessName: 'A' });
      mockSubRepo.findOne.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_xxx';
        if (key === 'STRIPE_PRICE_STARTER') return 'price_starter';
      });

      const result = await service.createCheckoutSession('u1', 'starter', 'http://s', 'http://c');

      expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/test' });
    });
  });

  // ─── createBillingPortal ──────────────────────────────────────────────────────

  describe('createBillingPortal', () => {
    it('throws BadRequestException when no subscription found', async () => {
      mockSubRepo.findOne.mockResolvedValue(null);

      await expect(service.createBillingPortal('u1', 'http://return'))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when subscription has no stripeCustomerId', async () => {
      mockSubRepo.findOne.mockResolvedValue({ stripeCustomerId: null });

      await expect(service.createBillingPortal('u1', 'http://return'))
        .rejects.toThrow(BadRequestException);
    });

    it('returns billing portal URL', async () => {
      mockSubRepo.findOne.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      mockConfig.get.mockReturnValue('sk_test_xxx');

      const result = await service.createBillingPortal('u1', 'http://return');

      expect(result).toEqual({ url: 'https://billing.stripe.com/portal/test' });
    });
  });

  // ─── getSubscription ──────────────────────────────────────────────────────────

  describe('getSubscription', () => {
    it('returns subscription and limits for current plan', async () => {
      mockSubRepo.findOne.mockResolvedValue({ plan: 'starter', status: 'active' });

      const result = await service.getSubscription('u1');

      expect(result.sub).toBeDefined();
      expect(result.limits).toEqual({ calls: 500, leads: 2000, campaigns: 1 });
    });

    it('returns free limits when no subscription found', async () => {
      mockSubRepo.findOne.mockResolvedValue(null);

      const result = await service.getSubscription('u1');

      expect(result.limits).toEqual({ calls: 50, leads: 100, campaigns: 1 });
    });

    it.each([
      ['free', { calls: 50, leads: 100, campaigns: 1 }],
      ['starter', { calls: 500, leads: 2000, campaigns: 1 }],
      ['professional', { calls: 2000, leads: 10000, campaigns: 5 }],
      ['agency', { calls: 99999, leads: 99999, campaigns: 99 }],
    ])('returns correct limits for plan "%s"', async (plan, expectedLimits) => {
      mockSubRepo.findOne.mockResolvedValue({ plan, status: 'active' });

      const result = await service.getSubscription('u1');

      expect(result.limits).toEqual(expectedLimits);
    });
  });

  // ─── canMakeCall ──────────────────────────────────────────────────────────────

  describe('canMakeCall', () => {
    it('returns false when no subscription', async () => {
      mockSubRepo.findOne.mockResolvedValue(null);

      expect(await service.canMakeCall('u1')).toBe(false);
    });

    it('returns false when subscription is past_due', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'past_due', plan: 'starter', callsThisMonth: 0 });

      expect(await service.canMakeCall('u1')).toBe(false);
    });

    it('returns false when subscription is canceled', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'canceled', plan: 'starter', callsThisMonth: 0 });

      expect(await service.canMakeCall('u1')).toBe(false);
    });

    it('returns true when below call limit', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'active', plan: 'starter', callsThisMonth: 100 });

      expect(await service.canMakeCall('u1')).toBe(true);
    });

    it('returns false when at call limit', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'active', plan: 'starter', callsThisMonth: 500 });

      expect(await service.canMakeCall('u1')).toBe(false);
    });

    it('returns false when above call limit', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'active', plan: 'free', callsThisMonth: 99 });

      expect(await service.canMakeCall('u1')).toBe(false);
    });

    it('returns true for trialing status', async () => {
      mockSubRepo.findOne.mockResolvedValue({ status: 'trialing', plan: 'professional', callsThisMonth: 0 });

      expect(await service.canMakeCall('u1')).toBe(true);
    });
  });

  // ─── incrementCallCount ───────────────────────────────────────────────────────

  describe('incrementCallCount', () => {
    it('increments callsThisMonth by 1', async () => {
      mockSubRepo.increment.mockResolvedValue({ affected: 1 });

      await service.incrementCallCount('u1');

      expect(mockSubRepo.increment).toHaveBeenCalledWith({ userId: 'u1' }, 'callsThisMonth', 1);
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('throws BadRequestException on invalid webhook signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });
      mockConfig.get.mockReturnValue('sk_test_xxx');

      await expect(
        service.handleWebhook(Buffer.from('body'), 'bad-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets callsThisMonth on invoice.payment_succeeded', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'invoice.payment_succeeded',
        data: { object: { customer: 'cus_1' } },
      });
      mockSubRepo.update.mockResolvedValue({});
      mockConfig.get.mockReturnValue('sk_test_xxx');

      await service.handleWebhook(Buffer.from('b'), 'sig');

      expect(mockSubRepo.update).toHaveBeenCalledWith(
        { stripeCustomerId: 'cus_1' },
        { callsThisMonth: 0 },
      );
    });

    it('sets status to past_due on invoice.payment_failed', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_2' } },
      });
      mockSubRepo.update.mockResolvedValue({});
      mockConfig.get.mockReturnValue('sk_test_xxx');

      await service.handleWebhook(Buffer.from('b'), 'sig');

      expect(mockSubRepo.update).toHaveBeenCalledWith(
        { stripeCustomerId: 'cus_2' },
        { status: 'past_due' },
      );
    });

    it('downgrades to free plan on customer.subscription.deleted', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: { object: { customer: 'cus_3' } },
      });
      mockSubRepo.update.mockResolvedValue({});
      mockConfig.get.mockReturnValue('sk_test_xxx');

      await service.handleWebhook(Buffer.from('b'), 'sig');

      expect(mockSubRepo.update).toHaveBeenCalledWith(
        { stripeCustomerId: 'cus_3' },
        { plan: 'free', status: 'canceled' },
      );
    });

    it('returns { received: true } for all handled events', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'invoice.payment_succeeded',
        data: { object: { customer: 'cus_1' } },
      });
      mockSubRepo.update.mockResolvedValue({});
      mockConfig.get.mockReturnValue('sk_test_xxx');

      const result = await service.handleWebhook(Buffer.from('b'), 'sig');

      expect(result).toEqual({ received: true });
    });
  });
});
