export type Subscription = {
  plan?: string;
  callsThisMonth?: number;
  currentPeriodEnd?: string;
  [key: string]: any;
};

export type PlanLimits = { calls: number; [key: string]: any };

export type SubscriptionResponse = { sub: Subscription | null; limits: PlanLimits | null };

export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  features: string[];
  accent: string;
  recommended?: boolean;
};
