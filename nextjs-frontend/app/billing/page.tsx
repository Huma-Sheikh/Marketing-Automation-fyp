"use client";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { getSubscription, createCheckout, createPortal } from "@/lib/api";

const PLANS = [
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

export default function BillingPage() {
  const [sub, setSub] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [loading, setLoading] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getSubscription().then(d => { setSub(d.sub); setLimits(d.limits); }).catch(console.error);
  }, []);

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    try { const { url } = await createCheckout(planId); window.location.href = url; }
    catch (e: any) { alert(e.message); setLoading(""); }
  };

  const handlePortal = async () => {
    try { const { url } = await createPortal(); window.location.href = url; }
    catch (e: any) { alert(e.message); }
  };

  const currentPlan = sub?.plan || "free";
  const usagePct = limits ? Math.round(((sub?.callsThisMonth || 0) / limits.calls) * 100) : 0;

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-mist-100">Billing</h1>
          <p className="text-mist-500 text-sm font-body mt-1">All plans include AI-powered calls, scraping, email, and SMS</p>
        </div>

        {/* Current plan banner */}
        {sub && (
          <div className="glass rounded-2xl p-5 mb-8 border border-electric-500/15 animate-fade-in">
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
                        background: usagePct > 80 ? "#EF4444" : usagePct > 60 ? "#F59E0B" : "#10B981"
                      }} />
                    </div>
                  </div>
                </div>
              )}
              {currentPlan !== "free" && (
                <button onClick={handlePortal}
                  className="glass border border-ink-600 text-mist-300 hover:text-mist-100 text-sm font-body px-4 py-2 rounded-xl transition-all hover:border-ink-500">
                  Manage →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pricing cards */}
        <div className="grid grid-cols-3 gap-5">
          {PLANS.map((plan, i) => (
            <div key={plan.id}
              className={`card-lift relative rounded-2xl p-6 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${
                plan.recommended ? "border-2" : "glass border border-ink-600/30"
              }`}
              style={{
                transitionDelay: `${i * 80}ms`,
                ...(plan.recommended ? {
                  background: `linear-gradient(135deg, ${plan.accent}10, rgba(10,12,20,0.9))`,
                  borderColor: `${plan.accent}40`,
                  boxShadow: `0 0 40px ${plan.accent}15`
                } : {})
              }}>
              {plan.recommended && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <div className="bg-electric-600 text-white text-xs px-4 py-1 rounded-full font-display font-semibold shadow-glow-blue">
                    Most Popular
                  </div>
                </div>
              )}

              {/* Plan name & price */}
              <div className="mb-5">
                <div className="font-display font-bold text-lg text-mist-100 mb-3">{plan.name}</div>
                <div className="flex items-end gap-1">
                  <span className="font-display font-bold text-4xl" style={{ color: plan.accent }}>{plan.price}</span>
                  <span className="text-mist-500 font-body text-sm mb-1">{plan.period}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm font-body text-mist-300">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: `${plan.accent}20`, color: plan.accent }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {currentPlan === plan.id ? (
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 text-sm font-body font-medium px-4 py-2 rounded-xl" style={{ background: `${plan.accent}15`, color: plan.accent }}>
                    <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: plan.accent }} />
                    Active Plan
                  </span>
                </div>
              ) : (
                <button onClick={() => handleSubscribe(plan.id)} disabled={!!loading}
                  className="btn-press w-full py-3 rounded-xl font-display font-bold text-sm transition-all disabled:opacity-50"
                  style={{
                    background: plan.recommended ? plan.accent : `${plan.accent}18`,
                    color: plan.recommended ? "#fff" : plan.accent,
                    boxShadow: plan.recommended ? `0 0 20px ${plan.accent}40` : "none",
                  }}>
                  {loading === plan.id ? "Redirecting..." : "Get Started →"}
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
