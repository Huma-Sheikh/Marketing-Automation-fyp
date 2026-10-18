function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
          done ? "bg-neon-green text-ink-950"
            : active ? "bg-electric-600 text-white shadow-glow-blue"
            : "bg-ink-700 text-mist-600"
        }`}
      >
        {done ? "✓" : n}
      </div>
      <span className={`text-sm font-body ${active ? "text-mist-200 font-medium" : "text-mist-600"}`}>
        {label}
      </span>
    </div>
  );
}

/** Channel → Audience → Content progress indicator. */
export function WizardSteps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <Step n={1} label="Channel" active={step === 1} done={step > 1} />
      <div className="flex-1 h-px bg-ink-700" />
      <Step n={2} label="Audience" active={step === 2} done={step > 2} />
      <div className="flex-1 h-px bg-ink-700" />
      <Step n={3} label="Content" active={step === 3} done={false} />
    </div>
  );
}
