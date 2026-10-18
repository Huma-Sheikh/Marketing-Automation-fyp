import { Button, Card, inputClass } from "@/components/ui";
import { CAMPAIGN_TYPES } from "../constants";
import type { CampaignWizard } from "../hooks/useCampaignWizard";

/** Wizard step 1: campaign name and channel. */
export function ChannelStep({ wizard }: { wizard: CampaignWizard }) {
  const { form, setField, setType, goToStep2 } = wizard;
  return (
    <Card className="p-6 animate-slide-up">
      <h2 className="font-display font-semibold text-mist-200 mb-5">Campaign Basics</h2>

      <label className="block text-xs text-mist-500 font-body mb-1.5">Campaign name</label>
      <input
        type="text"
        value={form.name}
        onChange={setField("name")}
        onKeyDown={(e) => e.key === "Enter" && goToStep2()}
        className={inputClass}
        placeholder="e.g. Q1 Dubai dental outreach"
      />

      <label className="block text-xs text-mist-500 font-body mt-5 mb-2">Channel</label>
      <div className="grid grid-cols-2 gap-3">
        {CAMPAIGN_TYPES.map((t) => {
          const active = form.type === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                active ? "border-current" : "border-ink-600 hover:border-ink-500"
              }`}
              style={active ? { background: `${t.color}18`, borderColor: `${t.color}55` } : {}}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{t.icon}</span>
                <span className="font-display font-semibold text-sm" style={{ color: active ? t.color : "#C4D2F5" }}>
                  {t.label}
                </span>
              </div>
              <div className="text-xs text-mist-500 font-body">{t.desc}</div>
            </button>
          );
        })}
      </div>

      <Button onClick={goToStep2} className="mt-6 w-full py-3">
        Next →
      </Button>
    </Card>
  );
}
