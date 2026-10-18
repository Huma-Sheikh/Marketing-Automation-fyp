import type { Plan } from "../types";

type PlanCardProps = {
  plan: Plan;
  index: number;
  mounted: boolean;
  isCurrent: boolean;
  /** True while any checkout redirect is in progress (disables all CTAs). */
  busy: boolean;
  redirecting: boolean;
  onSubscribe: (planId: string) => void;
};

/** Pricing card with feature list and subscribe / active-plan CTA. */
export function PlanCard({ plan, index, mounted, isCurrent, busy, redirecting, onSubscribe }: PlanCardProps) {
  return (
    <div
      className={`card-lift relative rounded-2xl p-6 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${
        plan.recommended ? "border-2" : "glass border border-ink-600/30"
      }`}
      style={{
        transitionDelay: `${index * 80}ms`,
        ...(plan.recommended ? {
          background: `linear-gradient(135deg, ${plan.accent}10, rgba(10,12,20,0.9))`,
          borderColor: `${plan.accent}40`,
          boxShadow: `0 0 40px ${plan.accent}15`,
        } : {}),
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
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm font-body text-mist-300">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: `${plan.accent}20`, color: plan.accent }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 text-sm font-body font-medium px-4 py-2 rounded-xl" style={{ background: `${plan.accent}15`, color: plan.accent }}>
            <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: plan.accent }} />
            Active Plan
          </span>
        </div>
      ) : (
        <button onClick={() => onSubscribe(plan.id)} disabled={busy}
          className="btn-press w-full py-3 rounded-xl font-display font-bold text-sm transition-all disabled:opacity-50"
          style={{
            background: plan.recommended ? plan.accent : `${plan.accent}18`,
            color: plan.recommended ? "#fff" : plan.accent,
            boxShadow: plan.recommended ? `0 0 20px ${plan.accent}40` : "none",
          }}>
          {redirecting ? "Redirecting..." : "Get Started →"}
        </button>
      )}
    </div>
  );
}
