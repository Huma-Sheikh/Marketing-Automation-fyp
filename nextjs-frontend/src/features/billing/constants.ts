import type { Plan } from "./types";

/** Plans shown on the Billing page; ids must match the backend's plan names. */
export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", price: "$49", period: "/mo",
    features: ["500 AI calls/month", "2,000 leads", "1 campaign", "Email + SMS", "Analytics"],
    accent: "#3B82F6" },
  { id: "professional", name: "Professional", price: "$99", period: "/mo", recommended: true,
    features: ["2,000 AI calls/month", "10,000 leads", "5 campaigns", "Full analytics", "Priority support"],
    accent: "#8B5CF6" },
  { id: "agency", name: "Agency", price: "$199", period: "/mo",
    features: ["Unlimited AI calls", "Unlimited leads", "Unlimited campaigns", "White-label", "API access"],
    accent: "#10B981" },
];
