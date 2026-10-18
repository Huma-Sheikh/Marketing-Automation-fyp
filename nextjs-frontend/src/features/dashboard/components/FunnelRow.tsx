/** One bar of the lead pipeline funnel. */
export function FunnelRow({ label, val, total, color }: { label: string; val: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((val / total) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-mist-400 font-body">{label}</span>
        <span className="font-mono" style={{ color }}>{val} <span className="text-mist-600">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: pct + "%", background: `linear-gradient(90deg, ${color}, ${color}99)`, boxShadow: `0 0 8px ${color}60` }} />
      </div>
    </div>
  );
}
