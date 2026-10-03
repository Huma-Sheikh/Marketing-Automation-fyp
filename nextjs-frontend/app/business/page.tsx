"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  BusinessQuery,
  findBusinessOpportunities,
  getBusinessRegions,
  importLeads,
  searchBusinesses,
} from "@/lib/api";

const CATEGORIES = [
  "restaurant", "dentist", "gym", "salon", "real estate agency",
  "car repair", "law firm", "clinic", "hotel", "retail store",
];

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

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const cfg = SENTIMENT[sentiment as keyof typeof SENTIMENT] ?? SENTIMENT.NEUTRAL;
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full font-mono font-medium"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

export default function BusinessPage() {
  const [regions, setRegions] = useState<{ code: string; label: string }[]>([]);
  const [regionCode, setRegionCode] = useState("");
  const [freeLocation, setFreeLocation] = useState("");
  const [category, setCategory] = useState("dentist");
  const [opportunitiesOnly, setOpportunitiesOnly] = useState(true);

  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [expanded, setExpanded] = useState<string>("");

  useEffect(() => {
    getBusinessRegions()
      .then((r) => {
        setRegions(r);
        if (r.length) setRegionCode(r[0].code);
      })
      .catch(() => setRegions([]));
  }, []);

  const runSearch = async () => {
    const location = regionCode || freeLocation.trim();
    if (!location || !category.trim()) {
      setError("Pick a location and a category first");
      return;
    }
    setLoading(true);
    setError("");
    setImported(0);
    try {
      const query: BusinessQuery = {
        location,
        category: category.trim(),
        region_code: regionCode || undefined,
        max_results: 20,
      };
      const data = opportunitiesOnly
        ? await findBusinessOpportunities(query)
        : await searchBusinesses(query);
      setResults(data.businesses || []);
      setSearched(true);
      if (data.error) setError(data.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  /** Turn the callable results into leads so a campaign can dial them. */
  const importCallable = async () => {
    const callable = results.filter((b) => b.phone || b.phone_intl);
    if (!callable.length) return;

    setImporting(true);
    setError("");
    try {
      const leads = callable.map((b) => ({
        firstName: b.name,
        lastName: "",
        phone: b.phone_intl || b.phone,
        company: b.name,
        location: b.address,
        website: b.website || null,
        sourceplatform: "google-places",
        rawData: b,
      }));
      const res = await importLeads(leads);
      setImported(res.count ?? leads.length);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const callableCount = results.filter((b) => b.phone || b.phone_intl).length;

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-mist-100">Business Search</h1>
          <p className="text-mist-500 text-sm font-body mt-1">
            Google Places · RoBERTa review sentiment · DistilBERT category model
          </p>
        </div>

        {/* Search panel */}
        <div className="glass rounded-2xl p-6 mb-6 border border-electric-500/10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-electric-400 animate-pulse-slow" />
            <h2 className="font-display font-semibold text-mist-200 text-sm uppercase tracking-widest">
              Find Businesses
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-mist-500 font-body mb-1.5">Region</label>
              <select
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value)}
                className="w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
              >
                <option value="">— Custom location —</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
              {!regionCode && (
                <input
                  type="text"
                  value={freeLocation}
                  onChange={(e) => setFreeLocation(e.target.value)}
                  placeholder="e.g. Manchester, United Kingdom"
                  className="input-glow mt-2 w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body placeholder-ink-600"
                />
              )}
            </div>

            <div>
              <label className="block text-xs text-mist-500 font-body mb-1.5">Category</label>
              <input
                list="business-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
              />
              <datalist id="business-categories">
                {CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={opportunitiesOnly}
              onChange={(e) => setOpportunitiesOnly(e.target.checked)}
              className="accent-electric-500"
            />
            <span className="text-sm text-mist-400 font-body">
              Opportunities only — poorly-rated businesses first, with an outreach script
            </span>
          </label>

          <button
            onClick={runSearch}
            disabled={loading}
            className="btn-press flex items-center gap-2 bg-electric-600 hover:bg-electric-500 text-white px-6 py-3 rounded-xl text-sm font-display font-semibold disabled:opacity-40 transition-all shadow-glow-blue"
          >
            {loading ? "Searching..." : "Search"}
          </button>

          {error && (
            <p className="text-neon-red text-sm mt-3 font-body flex items-center gap-1">
              <span>✕</span> {error}
            </p>
          )}
        </div>

        {/* Results header */}
        {searched && (
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs text-mist-600">
              {results.length} businesses · {callableCount} with a phone number
            </span>
            {callableCount > 0 && (
              <button
                onClick={importCallable}
                disabled={importing}
                className="btn-press bg-neon-green/80 hover:bg-neon-green text-ink-950 px-4 py-2 rounded-xl text-xs font-display font-bold disabled:opacity-40 transition-all"
              >
                {importing ? "Importing..." : `Import ${callableCount} as leads`}
              </button>
            )}
          </div>
        )}

        {imported > 0 && (
          <div className="mb-4 bg-neon-green/10 border border-neon-green/20 text-neon-green text-sm px-4 py-3 rounded-xl font-body">
            Imported {imported} businesses as leads — they are on the Leads page now.
          </div>
        )}

        {/* Results */}
        <div className="space-y-3">
          {searched && !loading && results.length === 0 && (
            <div className="glass rounded-2xl text-center py-16">
              <div className="text-4xl mb-3">◇</div>
              <p className="text-mist-500 font-body text-sm">
                No businesses found for that search
              </p>
            </div>
          )}

          {results.map((b, i) => (
            <div key={b.place_id || i} className="glass rounded-2xl p-5 border border-ink-600/30">
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
                    onClick={() => setExpanded(expanded === (b.place_id || String(i)) ? "" : (b.place_id || String(i)))}
                    className="text-xs font-mono text-electric-400 hover:text-electric-300 transition-colors"
                  >
                    {expanded === (b.place_id || String(i)) ? "− hide" : "+ show"} outreach script
                  </button>
                  {expanded === (b.place_id || String(i)) && (
                    <p className="mt-2 text-sm text-mist-300 font-body italic bg-ink-800/60 rounded-xl px-4 py-3">
                      “{b.outreach_script}”
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
