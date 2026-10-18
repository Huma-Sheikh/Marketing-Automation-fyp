import { Spinner, TrashIcon } from "@/components/ui";
import { TYPE_CONFIG } from "../constants";
import type { Campaign } from "../types";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

type CampaignCardProps = {
  c: Campaign;
  actionId: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
};

/** One campaign with its stats, progress bar and start/pause/delete controls. */
export function CampaignCard({ c, onStart, onStop, onDelete, actionId }: CampaignCardProps) {
  const tc = TYPE_CONFIG[c.type] || TYPE_CONFIG.mixed;
  const isRunning = c.status === "running";
  const busy = actionId === c.id;
  const progress = c.totalLeads > 0 ? Math.round(((c.contactedCount || 0) / c.totalLeads) * 100) : 0;

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
        <CampaignStatusBadge status={c.status} />
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
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-neon-green shadow-glow-green transition-all duration-700"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(c.status === "draft" || c.status === "paused") && (
          <button onClick={() => onStart(c.id)} disabled={busy}
            className="btn-press flex-1 flex items-center justify-center gap-2 bg-neon-green/80 hover:bg-neon-green text-ink-950 py-2 rounded-xl text-sm font-display font-bold disabled:opacity-40 transition-all">
            {busy ? <Spinner /> : "▶"} {busy ? "Starting..." : "Start"}
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
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
