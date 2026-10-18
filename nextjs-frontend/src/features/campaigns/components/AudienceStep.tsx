import { Button, Card } from "@/components/ui";
import type { CampaignWizard } from "../hooks/useCampaignWizard";

/** Wizard step 2: all unworked leads, or a hand-picked selection. */
export function AudienceStep({ wizard }: { wizard: CampaignWizard }) {
  const {
    selectedType, targetCount, targetAll, setTargetAll,
    leads, leadsLoading, leadsError, selectedLeadIds, toggleLead, goToStep3, back,
  } = wizard;

  return (
    <Card className="p-6 animate-slide-up">
      <h2 className="font-display font-semibold text-mist-200 mb-1">Audience</h2>
      <p className="text-xs text-mist-500 font-body mb-5">
        {selectedType.icon} {selectedType.label} · {targetCount} lead{targetCount === 1 ? "" : "s"} targeted
      </p>

      <div className="space-y-2 mb-4">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="radio" checked={targetAll} onChange={() => setTargetAll(true)} className="mt-1 accent-electric-500" />
          <span className="text-sm text-mist-300 font-body">
            All unworked leads
            <span className="block text-xs text-mist-600 mt-0.5">
              Every lead still marked “new”. Note that a second campaign started
              this way will target the same people.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="radio" checked={!targetAll} onChange={() => setTargetAll(false)} className="mt-1 accent-electric-500" />
          <span className="text-sm text-mist-300 font-body">
            Pick specific leads
            <span className="block text-xs text-mist-600 mt-0.5">
              Choose exactly who this campaign contacts.
            </span>
          </span>
        </label>
      </div>

      {!targetAll && (
        <div className="border border-ink-600 rounded-xl max-h-72 overflow-y-auto divide-y divide-ink-800/60 mb-4">
          {leadsLoading ? (
            <div className="px-4 py-6 text-center text-mist-600 text-sm font-body">Loading leads…</div>
          ) : leadsError ? (
            <div className="px-4 py-6 text-center text-neon-red text-sm font-body">{leadsError}</div>
          ) : leads.length === 0 ? (
            <div className="px-4 py-6 text-center text-mist-600 text-sm font-body">
              No leads yet — find some on the Leads or Business Search page first.
            </div>
          ) : (
            leads.map((l) => (
              <label key={l.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-ink-800/40 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedLeadIds.includes(l.id)}
                  onChange={() => toggleLead(l.id)}
                  className="accent-electric-500"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-mist-200 font-body truncate">
                    {l.firstName} {l.lastName} {l.company ? `· ${l.company}` : ""}
                  </span>
                  <span className="block text-xs text-mist-600 font-mono truncate">
                    {l.phone || l.email || "no contact details"}
                  </span>
                </span>
                <span className="text-xs font-mono text-mist-500">{Math.round(l.score ?? 0)}</span>
              </label>
            ))
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => back(1)} className="px-5 py-3 text-sm">
          ← Back
        </Button>
        <Button onClick={goToStep3} className="flex-1 py-3">
          Next →
        </Button>
      </div>
    </Card>
  );
}
