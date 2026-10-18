import { Badge } from "@/components/ui";
import type { Business } from "../types";

const SENTIMENT = {
  NEGATIVE: { color: "#EF4444", bg: "rgba(239,68,68,0.12)", label: "Negative" },
  NEUTRAL: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: "Neutral" },
  POSITIVE: { color: "#10B981", bg: "rgba(16,185,129,0.12)", label: "Positive" },
} as const;

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-mist-600 text-xs font-mono">no rating</span>;
  const color = rating < 3 ? "#EF4444" : rating < 4 ? "#F59E0B" : "#10B981";
  return (
    <span className="font-mono text-sm font-semibold" style={{ color }}>
      {rating.toFixed(1)} ★
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  const cfg = SENTIMENT[sentiment as keyof typeof SENTIMENT] ?? SENTIMENT.NEUTRAL;
  return <Badge color={cfg.color} background={cfg.bg}>{cfg.label}</Badge>;
}

type BusinessCardProps = {
  b: Business;
  /** Whether the outreach script is expanded (only one card at a time). */
  showScript: boolean;
  onToggleScript: () => void;
};

/** One search result: rating, review sentiment, contact info and outreach script. */
export function BusinessCard({ b, showScript, onToggleScript }: BusinessCardProps) {
  return (
    <div className="glass rounded-2xl p-5 border border-ink-600/30">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="font-display font-semibold text-mist-100">{b.name}</div>
          <div className="text-xs text-mist-500 font-body mt-0.5">{b.address}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Stars rating={b.rating} />
          <SentimentBadge sentiment={b.sentiment} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-mist-400 mb-3">
        {(b.phone || b.phone_intl) && <span># {b.phone_intl || b.phone}</span>}
        {b.website && <span>↗ {b.website.replace(/^https?:\/\//, "")}</span>}
        {b.review_count != null && <span>{b.review_count} reviews</span>}
        {b.business_category && <span className="text-mist-500">{b.business_category}</span>}
      </div>

      {b.opportunity && (
        <div className="text-sm text-mist-300 font-body bg-ink-800/60 rounded-xl px-4 py-2.5">
          {b.opportunity}
        </div>
      )}

      {b.outreach_script && (
        <div className="mt-3">
          <button
            onClick={onToggleScript}
            className="text-xs font-mono text-electric-400 hover:text-electric-300 transition-colors"
          >
            {showScript ? "− hide" : "+ show"} outreach script
          </button>
          {showScript && (
            <p className="mt-2 text-sm text-mist-300 font-body italic bg-ink-800/60 rounded-xl px-4 py-3">
              “{b.outreach_script}”
            </p>
          )}
        </div>
      )}
    </div>
  );
}
