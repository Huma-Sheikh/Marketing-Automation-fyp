"use client";
import { Alert, Card, PageHeader } from "@/components/ui";
import { PlanCard } from "@/features/billing/components/PlanCard";
import { PLANS } from "@/features/billing/constants";
import { useBilling } from "@/features/billing/hooks/useBilling";
import { useMounted } from "@/hooks/useMounted";

export default function BillingPage() {
  const mounted = useMounted();
  const { sub, limits, error, redirectingPlan, currentPlan, usagePct, subscribe, openPortal } = useBilling();

  return (
    <>
      <PageHeader title="Billing" subtitle="All plans include AI-powered calls, scraping, email, and SMS" />

      <Alert className="mb-8">{error}</Alert>

      {/* Current plan banner */}
      {sub && (
        <Card className="p-5 mb-8 border border-electric-500/15 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-mist-500 uppercase tracking-widest font-body mb-1">Current Plan</div>
              <div className="font-display font-bold text-xl text-mist-100 capitalize">{currentPlan}</div>
              {sub?.currentPeriodEnd && (
                <div className="text-xs text-mist-500 font-body mt-1">Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</div>
              )}
            </div>
            {limits && (
              <div className="text-right">
                <div className="text-xs text-mist-500 font-body mb-2">Calls this month</div>
                <div className="w-40">
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-mist-400">{sub?.callsThisMonth || 0}</span>
                    <span className="text-mist-600">{limits.calls}</span>
                  </div>
                  <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{
                      width: usagePct + "%",
                      background: usagePct > 80 ? "#EF4444" : usagePct > 60 ? "#F59E0B" : "#10B981",
                    }} />
                  </div>
                </div>
              </div>
            )}
            {currentPlan !== "free" && (
              <button onClick={openPortal}
                className="glass border border-ink-600 text-mist-300 hover:text-mist-100 text-sm font-body px-4 py-2 rounded-xl transition-all hover:border-ink-500">
                Manage →
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Pricing cards */}
      <div className="grid grid-cols-3 gap-5">
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            index={i}
            mounted={mounted}
            isCurrent={currentPlan === plan.id}
            busy={!!redirectingPlan}
            redirecting={redirectingPlan === plan.id}
            onSubscribe={subscribe}
          />
        ))}
      </div>
    </>
  );
}
