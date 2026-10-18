import { Card, EmptyState, Skeleton } from "@/components/ui";
import type { Lead } from "../types";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { ScoreBadge } from "./ScoreBadge";

const HEADERS = ["Name", "Company", "Title", "Contact", "Score", "Status", ""];

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-4 py-3.5"><Skeleton className="h-4 rounded" style={{ width: `${60 + i * 10}%` }} /></td>
      ))}
    </tr>
  );
}

type LeadsTableProps = {
  leads: Lead[];
  loading: boolean;
  deleteId: string;
  onDelete: (id: string) => void;
};

/** Table of leads with score gauge, status pill and delete action. */
export function LeadsTable({ leads, loading, deleteId, onDelete }: LeadsTableProps) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-ink-700/50">
            {HEADERS.map((h) => (
              <th key={h} className="text-left px-4 py-3.5 text-xs font-body font-semibold text-mist-500 uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800/50">
          {loading ? (
            [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)
          ) : leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-16">
                <EmptyState size="small" icon="◈" description="No leads yet — search above to find your first leads" />
              </td>
            </tr>
          ) : leads.map((lead) => (
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
              <td className="px-4 py-3.5"><LeadStatusBadge status={lead.status} /></td>
              <td className="px-4 py-3.5">
                <button onClick={() => onDelete(lead.id)} disabled={deleteId === lead.id}
                  className="text-ink-500 hover:text-neon-red transition-colors text-xs font-mono px-2 py-1 rounded-lg hover:bg-neon-red/10">
                  del
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
