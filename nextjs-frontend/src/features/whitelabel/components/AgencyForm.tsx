import React from "react";
import { Card } from "@/components/ui";
import type { AgencyInput } from "../types";

type AgencyFormProps = {
  form: AgencyInput;
  setField: (k: keyof AgencyInput) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

const fieldClass = "input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body";
const labelClass = "block text-xs text-mist-400 uppercase tracking-widest font-body mb-2";

/** Create-agency form (name, domain, brand colour, logo). */
export function AgencyForm({ form, setField, saving, onSubmit }: AgencyFormProps) {
  return (
    <Card className="p-6 mb-6 border border-neon-teal/20 animate-slide-up">
      <h2 className="font-display font-semibold text-mist-200 mb-5">New White-Label Agency</h2>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Agency Name *</label>
            <input type="text" value={form.agencyName} onChange={setField("agencyName")} required
              className={fieldClass} placeholder="Acme Agency" />
          </div>
          <div>
            <label className={labelClass}>Custom Domain</label>
            <input type="text" value={form.customDomain} onChange={setField("customDomain")}
              className={`${fieldClass} font-mono`} placeholder="app.acmeagency.com" />
          </div>
          <div>
            <label className={labelClass}>Brand Color</label>
            <div className="flex gap-2">
              <input type="color" value={form.primaryColor} onChange={setField("primaryColor")}
                className="h-11 w-14 border border-ink-600 rounded-xl cursor-pointer bg-ink-800" />
              <input type="text" value={form.primaryColor} onChange={setField("primaryColor")}
                className="input-glow flex-1 bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Logo URL</label>
            <input type="url" value={form.logoUrl} onChange={setField("logoUrl")}
              className={fieldClass} placeholder="https://..." />
          </div>
        </div>
        <button type="submit" disabled={saving}
          className="btn-press bg-neon-teal/80 hover:bg-neon-teal text-ink-950 px-6 py-2.5 rounded-xl font-display font-bold text-sm transition-all disabled:opacity-50">
          {saving ? "Creating..." : "✓ Create Agency"}
        </button>
      </form>
    </Card>
  );
}
