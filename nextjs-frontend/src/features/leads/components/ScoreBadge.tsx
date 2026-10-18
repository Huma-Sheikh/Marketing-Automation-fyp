/** Circular 0-100 lead score gauge (green >= 70, amber >= 40, red below). */
export function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score);
  const color = s >= 70 ? "#10B981" : s >= 40 ? "#F59E0B" : "#EF4444";
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
