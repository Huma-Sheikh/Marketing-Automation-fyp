"use client";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { getLeads, scrapeLeads, deleteLead } from "@/lib/api";

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", emoji: "💼" },
  { id: "instagram", label: "Instagram", color: "#E1306C", emoji: "📸" },
  { id: "facebook", label: "Facebook", color: "#1877F2", emoji: "👥" },
  { id: "twitter", label: "Twitter", color: "#1DA1F2", emoji: "🐦" },
];

const STATUSES = ["", "new", "contacted", "qualified", "converted", "rejected"];

function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score);
  const color = s >= 70 ? "#10B981" : s >= 40 ? "#F59E0B" : "#EF4444";
  const bg = s >= 70 ? "rgba(16,185,129,0.12)" : s >= 40 ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-6 h-6">
        <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90">
          <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={`${(s / 100) * 56.5} 56.5`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        </svg>
      </div>
      <span className="text-xs font-mono font-semibold" style={{ color }}>{s}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: any = {
    new: { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
    contacted: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
    qualified: { color: "#06B6D4", bg: "rgba(6,182,212,0.12)" },
    converted: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
    rejected: { color: "#6B82A8", bg: "rgba(107,130,168,0.12)" },
  };
  const c = cfg[status] || cfg.new;
  return (
    <span className="text-xs px-2.5 py-1 rounded-full font-mono font-medium capitalize" style={{ color: c.color, background: c.bg }}>
      {status}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} className="px-4 py-3.5"><div className="h-4 rounded skeleton" style={{ width: `${60 + i * 10}%` }} /></td>
      ))}
    </tr>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [platform, setPlatform] = useState("linkedin");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState("");

  const load = async () => {
    setLoading(true);
    try { setLeads(await getLeads(statusFilter || undefined)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [statusFilter]);

  const handleScrape = async () => {
    if (!query.trim()) return;
    setScraping(true); setError("");
    try {
      const res = await scrapeLeads(platform, query, 100);
      setLeads(prev => [...(res.leads || []), ...prev]);
    } catch (e: any) { setError(e.message); }
    finally { setScraping(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
    await deleteLead(id);
    setLeads(prev => prev.filter(l => l.id !== id));
    setDeleteId("");
  };

  const activePlatform = PLATFORMS.find(p => p.id === platform);

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-mist-100">Leads</h1>
          <p className="text-mist-500 text-sm font-body mt-1">AI-powered scraping · NER extraction · XGBoost scoring</p>
        </div>

        {/* Scrape Panel */}
        <div className="glass rounded-2xl p-6 mb-6 border border-electric-500/10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-electric-400 animate-pulse-slow" />
            <h2 className="font-display font-semibold text-mist-200 text-sm uppercase tracking-widest">Find New Leads</h2>
          </div>
          {/* Platform picker */}
          <div className="flex gap-2 mb-4">
            {PLATFORMS.map(p => (
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
              value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleScrape()}
              className="input-glow flex-1 bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm placeholder-ink-600 font-body"
            />
            <button onClick={handleScrape} disabled={scraping || !query.trim()}
              className="btn-press flex items-center gap-2 bg-electric-600 hover:bg-electric-500 text-white px-6 py-3 rounded-xl text-sm font-display font-semibold disabled:opacity-40 transition-all shadow-glow-blue">
              {scraping ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Scanning...</>
              ) : (<> Find Leads</>)}
            </button>
          </div>
          {error && <p className="text-neon-red text-sm mt-3 font-body flex items-center gap-1"><span>✕</span> {error}</p>}
        </div>

        {/* Filter + Count */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {STATUSES.map(s => (
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

        {/* Table */}
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-700/50">
                {["Name", "Company", "Title", "Contact", "Score", "Status", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3.5 text-xs font-body font-semibold text-mist-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/50">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="text-4xl mb-3">◈</div>
                    <p className="text-mist-500 font-body text-sm">No leads yet — search above to find your first leads</p>
                  </td>
                </tr>
              ) : leads.map((lead: any) => (
                <tr key={lead.id} className={`hover:bg-ink-800/30 transition-colors ${deleteId === lead.id ? "opacity-30" : ""}`}>
                  <td className="px-4 py-3.5">
                    <div className="font-body font-medium text-mist-200 text-sm">{lead.firstName} {lead.lastName}</div>
                    {lead.location && <div className="text-xs text-mist-600 mt-0.5 font-body">{lead.location}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-mist-400 font-body">{lead.company || "—"}</td>
                  <td className="px-4 py-3.5 text-sm text-mist-400 font-body">{lead.jobTitle || "—"}</td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5">
                      {lead.email && <div className="text-xs text-mist-400 font-mono flex items-center gap-1"><span className="text-mist-600">@</span> {lead.email}</div>}
                      {lead.phone && <div className="text-xs text-mist-400 font-mono flex items-center gap-1"><span className="text-mist-600">#</span> {lead.phone}</div>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><ScoreBadge score={lead.score} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => handleDelete(lead.id)} disabled={deleteId === lead.id}
                      className="text-ink-500 hover:text-neon-red transition-colors text-xs font-mono px-2 py-1 rounded-lg hover:bg-neon-red/10">
                      del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
