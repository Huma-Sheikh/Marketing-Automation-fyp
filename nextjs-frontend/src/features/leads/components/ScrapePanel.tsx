"use client";
import { useState } from "react";
import { Alert, Card, SectionTitle, Spinner } from "@/components/ui";
import { PLATFORMS } from "../constants";

type ScrapePanelProps = {
  scraping: boolean;
  error: string;
  onScrape: (platform: string, query: string) => void;
};

/** Platform picker + search box that triggers a lead scrape. */
export function ScrapePanel({ scraping, error, onScrape }: ScrapePanelProps) {
  const [platform, setPlatform] = useState("linkedin");
  const [query, setQuery] = useState("");
  const activePlatform = PLATFORMS.find((p) => p.id === platform);
  const submit = () => onScrape(platform, query);

  return (
    <Card className="p-6 mb-6 border border-electric-500/10">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-electric-400 animate-pulse-slow" />
        <SectionTitle className="text-mist-200">Find New Leads</SectionTitle>
      </div>
      {/* Platform picker */}
      <div className="flex gap-2 mb-4">
        {PLATFORMS.map((p) => (
          <button key={p.id} onClick={() => setPlatform(p.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body font-medium transition-all duration-200 border ${platform === p.id
                ? "border-current text-white"
                : "border-ink-600 text-mist-500 hover:border-ink-500 hover:text-mist-300"
              }`}
            style={platform === p.id ? { background: `${p.color}20`, borderColor: `${p.color}50`, color: p.color } : {}}>
            <span>{p.emoji}</span> {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <input
          type="text" placeholder={`Search ${activePlatform?.label} leads... e.g. "CEO Dubai technology"`}
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          className="input-glow flex-1 bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm placeholder-ink-600 font-body"
        />
        <button onClick={submit} disabled={scraping || !query.trim()}
          className="btn-press flex items-center gap-2 bg-electric-600 hover:bg-electric-500 text-white px-6 py-3 rounded-xl text-sm font-display font-semibold disabled:opacity-40 transition-all shadow-glow-blue">
          {scraping ? (<><Spinner /> Scanning...</>) : (<> Find Leads</>)}
        </button>
      </div>
      <Alert appearance="inline" className="mt-3">{error}</Alert>
    </Card>
  );
}
