import { Badge } from "@/components/ui";

const STATUS_CLASSES: Record<string, string> = {
  running: "bg-neon-green/15 text-neon-green status-running",
  completed: "bg-electric-500/15 text-electric-400",
  paused: "bg-neon-amber/15 text-neon-amber",
};

/** Campaign status pill (running pulses green, completed blue, paused amber). */
export function CampaignStatusBadge({ status, fallbackClass = "bg-ink-700 text-mist-500" }: { status: string; fallbackClass?: string }) {
  return <Badge className={STATUS_CLASSES[status] ?? fallbackClass}>{status}</Badge>;
}
