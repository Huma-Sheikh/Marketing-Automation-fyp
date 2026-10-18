const COLORS: Record<string, string> = { healthy: "#10B981", unavailable: "#EF4444", unknown: "#6B82A8" };

/** Compact AI-service status chip with a pulsing dot when healthy. */
export function HealthDot({ label, status }: { label: string; status: string }) {
  const c = COLORS[status] || COLORS.unknown;
  return (
    <div className="flex items-center gap-2.5 bg-ink-800/50 px-3 py-2 rounded-xl border border-ink-600/50">
      <div className="relative">
        <div className="w-2 h-2 rounded-full" style={{ background: c }} />
        {status === "healthy" && <div className="absolute inset-0 rounded-full live-dot" style={{ background: c }} />}
      </div>
      <span className="text-xs font-body text-mist-400">{label}</span>
      <span className="text-xs font-mono ml-auto" style={{ color: c }}>{status}</span>
    </div>
  );
}
