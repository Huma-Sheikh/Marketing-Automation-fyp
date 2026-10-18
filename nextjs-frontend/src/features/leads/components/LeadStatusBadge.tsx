import { Badge } from "@/components/ui";

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  new: { color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  contacted: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  qualified: { color: "#06B6D4", bg: "rgba(6,182,212,0.12)" },
  converted: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  rejected: { color: "#6B82A8", bg: "rgba(107,130,168,0.12)" },
};

/** Lead pipeline status pill. */
export function LeadStatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <Badge color={c.color} background={c.bg} className="capitalize">
      {status}
    </Badge>
  );
}
