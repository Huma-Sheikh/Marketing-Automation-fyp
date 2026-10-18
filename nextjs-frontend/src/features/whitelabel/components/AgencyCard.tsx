import { Badge, TrashIcon } from "@/components/ui";
import type { Agency } from "../types";

/** One agency row with brand preview, domain, status and delete. */
export function AgencyCard({ a, onDelete }: { a: Agency; onDelete: (id: string) => void }) {
  return (
    <div className="card-lift glass rounded-2xl p-5 border border-ink-600/30 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Brand preview */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-lg text-white flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${a.primaryColor}, ${a.primaryColor}99)`, boxShadow: `0 0 20px ${a.primaryColor}30` }}>
          {a.agencyName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-display font-semibold text-mist-100">{a.agencyName}</div>
          {a.customDomain ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-teal" />
              <span className="text-sm text-neon-teal font-mono">{a.customDomain}</span>
            </div>
          ) : (
            <div className="text-xs text-mist-600 font-body mt-0.5">No custom domain set</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-xs text-mist-600 font-body">Color</div>
          <div className="w-6 h-6 rounded-lg mt-1" style={{ background: a.primaryColor }} />
        </div>
        <Badge className={a.status === "active" ? "bg-neon-green/15 text-neon-green" : "bg-neon-red/15 text-neon-red"}>
          {a.status}
        </Badge>
        <button onClick={() => onDelete(a.id)} className="text-ink-500 hover:text-neon-red transition-colors p-2 rounded-xl hover:bg-neon-red/10">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
