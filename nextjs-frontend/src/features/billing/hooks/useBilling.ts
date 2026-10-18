"use client";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { useToast } from "@/providers/ToastProvider";
import { billingApi } from "../api";
import type { PlanLimits, Subscription } from "../types";

/**
 * Current subscription + usage, and the Stripe checkout / customer-portal
 * redirects. `redirectingPlan` is the plan id whose checkout is opening.
 */
export function useBilling() {
  const toast = useToast();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redirectingPlan, setRedirectingPlan] = useState("");

  useEffect(() => {
    billingApi.subscription()
      .then((d) => { setSub(d.sub); setLimits(d.limits); })
      .catch((e) => setError(getErrorMessage(e, "Could not load your subscription")))
      .finally(() => setLoading(false));
  }, []);

  const subscribe = async (planId: string) => {
    setRedirectingPlan(planId);
    try {
      const { url } = await billingApi.checkout(planId);
      window.location.href = url;
    } catch (e) {
      toast.error(getErrorMessage(e));
      setRedirectingPlan("");
    }
  };

  const openPortal = async () => {
    try {
      const { url } = await billingApi.portal();
      window.location.href = url;
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const currentPlan = sub?.plan || "free";
  const usagePct = limits ? Math.round(((sub?.callsThisMonth || 0) / limits.calls) * 100) : 0;

  return { sub, limits, loading, error, redirectingPlan, currentPlan, usagePct, subscribe, openPortal };
}
