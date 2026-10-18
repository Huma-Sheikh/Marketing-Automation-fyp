/** Paid plans a customer can check out to. `free` is the default every account starts on. */
export const PAID_PLANS = ['starter', 'professional', 'agency'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type Plan = 'free' | PaidPlan;

/** Env var holding each paid plan's Stripe Price ID. */
export const PLAN_PRICE_ENV: Record<PaidPlan, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  professional: 'STRIPE_PRICE_PRO',
  agency: 'STRIPE_PRICE_AGENCY',
};

export interface PlanLimits {
  calls: number;
  leads: number;
  campaigns: number;
}

/** Monthly quotas. `calls` is enforced per dial in CallingQueueProcessor. */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:         { calls: 50,    leads: 100,   campaigns: 1 },
  starter:      { calls: 500,   leads: 2000,  campaigns: 1 },
  professional: { calls: 2000,  leads: 10000, campaigns: 5 },
  agency:       { calls: 99999, leads: 99999, campaigns: 99 },
};

/** Subscription states that may place calls. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

export const STRIPE_API_VERSION = '2024-06-20';
