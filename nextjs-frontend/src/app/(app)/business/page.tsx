"use client";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { BusinessCard } from "@/features/business/components/BusinessCard";
import { BUSINESS_CATEGORIES } from "@/features/business/constants";
import { useBusinessSearch } from "@/features/business/hooks/useBusinessSearch";

export default function BusinessPage() {
  const s = useBusinessSearch();
  const [expanded, setExpanded] = useState("");

  return (
    <>
      <PageHeader title="Business Search" subtitle="Google Places · RoBERTa review sentiment · DistilBERT category model" />

      {/* Search panel */}
      <Card className="p-6 mb-6 border border-electric-500/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-electric-400 animate-pulse-slow" />
          <SectionTitle className="text-mist-200">Find Businesses</SectionTitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">Region</label>
            <select
              value={s.regionCode}
              onChange={(e) => s.setRegionCode(e.target.value)}
              className="w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
            >
              <option value="">— Custom location —</option>
              {s.regions.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            {s.regionsError && <p className="text-xs text-neon-red font-body mt-1">{s.regionsError}</p>}
            {!s.regionCode && (
              <input
                type="text"
                value={s.freeLocation}
                onChange={(e) => s.setFreeLocation(e.target.value)}
                placeholder="e.g. Manchester, United Kingdom"
                className="input-glow mt-2 w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body placeholder-ink-600"
              />
            )}
          </div>

          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">Category</label>
            <input
              list="business-categories"
              value={s.category}
              onChange={(e) => s.setCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && s.search()}
              className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
            />
            <datalist id="business-categories">
              {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={s.opportunitiesOnly}
            onChange={(e) => s.setOpportunitiesOnly(e.target.checked)}
            className="accent-electric-500"
          />
          <span className="text-sm text-mist-400 font-body">
            Opportunities only — poorly-rated businesses first, with an outreach script
          </span>
        </label>

        <Button onClick={s.search} disabled={s.loading} className="flex items-center gap-2 px-6 py-3 text-sm">
          {s.loading ? "Searching..." : "Search"}
        </Button>

        <Alert appearance="inline" className="mt-3">{s.error}</Alert>
      </Card>

      {/* Results header */}
      {s.searched && (
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs text-mist-600">
            {s.results.length} businesses · {s.callableCount} with a phone number
          </span>
          {s.callableCount > 0 && (
            <Button variant="success" onClick={s.importCallable} disabled={s.importing} className="px-4 py-2 text-xs">
              {s.importing ? "Importing..." : `Import ${s.callableCount} as leads`}
            </Button>
          )}
        </div>
      )}

      {s.imported > 0 && (
        <Alert variant="success" className="mb-4">
          Imported {s.imported} businesses as leads — they are on the Leads page now.
        </Alert>
      )}

      {/* Results */}
      <div className="space-y-3">
        {s.searched && !s.loading && s.results.length === 0 && (
          <Card className="text-center py-16">
            <EmptyState size="small" icon="◇" description="No businesses found for that search" />
          </Card>
        )}

        {s.results.map((b, i) => {
          const key = b.place_id || String(i);
          return (
            <BusinessCard
              key={key}
              b={b}
              showScript={expanded === key}
              onToggleScript={() => setExpanded(expanded === key ? "" : key)}
            />
          );
        })}
      </div>
    </>
  );
}
