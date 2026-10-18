import { http } from "@/lib/http";
import type { SubscriptionResponse } from "./types";

/** Stripe billing endpoints. Checkout and portal return a redirect URL. */
export const billingApi = {
  subscription: () => http.get<SubscriptionResponse>("/billing/subscription"),
  checkout: (plan: string) => http.post<{ url: string }>("/billing/checkout", { plan }),
  portal: () => http.post<{ url: string }>("/billing/portal"),
};
