"use client";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { LeadsTable } from "@/features/leads/components/LeadsTable";
import { ScrapePanel } from "@/features/leads/components/ScrapePanel";
import { STATUSES } from "@/features/leads/constants";
import { useLeads } from "@/features/leads/hooks/useLeads";

export default function LeadsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const { leads, loading, scraping, error, deleteId, scrape, remove } = useLeads(statusFilter);

  return (
    <>
      <PageHeader title="Leads" subtitle="AI-powered scraping · NER extraction · XGBoost scoring" />

      <ScrapePanel scraping={scraping} error={error} onScrape={scrape} />

      {/* Filter + Count */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all capitalize ${statusFilter === s
                  ? "bg-electric-600 text-white shadow-glow-blue"
                  : "bg-ink-800 text-mist-500 hover:bg-ink-700 hover:text-mist-300 border border-ink-600"
                }`}>
              {s === "" ? "All" : s}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-mist-600">{leads.length} leads</span>
      </div>

      <LeadsTable leads={leads} loading={loading} deleteId={deleteId} onDelete={remove} />
    </>
  );
}
