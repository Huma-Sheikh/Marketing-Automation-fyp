"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { getCampaigns, startCampaign, stopCampaign, deleteCampaign } from "@/lib/api";

const TYPE_CONFIG: any = {
  call:  { icon: "📞", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  email: { icon: "✉",  color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  sms:   { icon: "💬", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  mixed: { icon: "⚡", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
};

function CampaignCard({ c, onStart, onStop, onDelete, actionId }: any) {
  const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.mixed;
  const isRunning = c.status === "running";
  const busy = actionId === c.id;

  return (
    <div className={`card-lift glass rounded-2xl p-5 border transition-all duration-300 ${isRunning ? "border-neon-green/20 shadow-glow-green" : "border-ink-600/30"}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: tc.bg }}>
            {tc.icon}
          </div>
          <div>
            <div className="font-display font-semibold text-mist-100">{c.name}</div>
            <div className="text-xs text-mist-500 font-body mt-0.5 capitalize">{c.type} campaign</div>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${
          isRunning ? "bg-neon-green/15 text-neon-green status-running" :
          c.status === "completed" ? "bg-electric-500/15 text-electric-400" :
          c.status === "paused"    ? "bg-neon-amber/15 text-neon-amber" :
          "bg-ink-700 text-mist-500"
        }`}>{c.status}</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Leads",     val: c.totalLeads },
          { label: "Contacted", val: c.contactedCount },
          { label: "Converted", val: c.convertedCount },
        ].map(({ label, val }) => (
          <div key={label} className="bg-ink-800/60 rounded-xl px-3 py-2 text-center">
            <div className="font-mono font-semibold text-mist-200">{val || 0}</div>
            <div className="text-xs text-mist-600 font-body mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar if running */}
      {isRunning && c.totalLeads > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-mist-600 mb-1.5 font-mono">
            <span>Progress</span>
            <span>{Math.round(((c.contactedCount || 0) / c.totalLeads) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-neon-green shadow-glow-green transition-all duration-700"
              style={{ width: `${Math.round(((c.contactedCount || 0) / c.totalLeads) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(c.status === "draft" || c.status === "paused") && (
          <button onClick={() => onStart(c.id)} disabled={busy}
            className="btn-press flex-1 flex items-center justify-center gap-2 bg-neon-green/80 hover:bg-neon-green text-ink-950 py-2 rounded-xl text-sm font-display font-bold disabled:opacity-40 transition-all">
            {busy ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : "▶"} {busy ? "Starting..." : "Start"}
          </button>
        )}
        {isRunning && (
          <button onClick={() => onStop(c.id)} disabled={busy}
            className="btn-press flex-1 flex items-center justify-center gap-2 bg-neon-amber/20 hover:bg-neon-amber/30 text-neon-amber py-2 rounded-xl text-sm font-display font-bold border border-neon-amber/30 disabled:opacity-40 transition-all">
            ⏸ {busy ? "Stopping..." : "Pause"}
          </button>
        )}
        <button onClick={() => onDelete(c.id)}
          className="p-2 rounded-xl text-ink-500 hover:text-neon-red hover:bg-neon-red/10 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");

  const load = async () => {
    try { setCampaigns(await getCampaigns()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleStart = async (id: string) => {
    setActionId(id);
    try { await startCampaign(id); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionId(""); }
  };
  const handleStop = async (id: string) => {
    setActionId(id);
    try { await stopCampaign(id); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setActionId(""); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete campaign?")) return;
    await deleteCampaign(id);
    setCampaigns(c => c.filter(x => x.id !== id));
  };

  const running = campaigns.filter(c => c.status === "running").length;

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl text-mist-100">Campaigns</h1>
            <p className="text-mist-500 text-sm font-body mt-1">
              {running > 0 ? <><span className="text-neon-green status-running">●</span> {running} running now</> : "No active campaigns"}
            </p>
          </div>
          <Link href="/campaigns/new"
            className="btn-press flex items-center gap-2 bg-electric-600 hover:bg-electric-500 text-white px-5 py-2.5 rounded-xl text-sm font-display font-semibold shadow-glow-blue transition-all">
            + New Campaign
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 stagger">{[1,2,3,4].map(i => <div key={i} className="h-52 rounded-2xl skeleton" />)}</div>
        ) : campaigns.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center border border-ink-600/30">
            <div className="text-5xl mb-4 animate-float">📣</div>
            <h2 className="font-display font-semibold text-mist-200 mb-2">No campaigns yet</h2>
            <p className="text-mist-500 text-sm font-body mb-6">Create your first campaign to start reaching leads at scale.</p>
            <Link href="/campaigns/new" className="inline-flex items-center gap-2 bg-electric-600 text-white px-6 py-2.5 rounded-xl font-display font-semibold text-sm hover:bg-electric-500 transition-all shadow-glow-blue">
              Create Campaign →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 stagger">
            {campaigns.map(c => (
              <CampaignCard key={c.id} c={c} onStart={handleStart} onStop={handleStop} onDelete={handleDelete} actionId={actionId} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
