import Link from "next/link";
import { Button, Card, inputClass } from "@/components/ui";
import { usesCalls, usesEmail, usesSms } from "../constants";
import type { CampaignWizard } from "../hooks/useCampaignWizard";

/** Wizard step 3: per-channel content, caller number and calling window. */
export function ContentStep({ wizard }: { wizard: CampaignWizard }) {
  const { form, setField, setNumberField, phoneNumbers, phoneNumbersError, defaultNumber, back, submit, submitting } = wizard;

  return (
    <Card className="p-6 animate-slide-up space-y-5">
      <div>
        <h2 className="font-display font-semibold text-mist-200">Content</h2>
        <p className="text-xs text-mist-500 font-body mt-1">
          Use <code className="font-mono text-electric-400">{"{{firstName}}"}</code>,{" "}
          <code className="font-mono text-electric-400">{"{{company}}"}</code> and{" "}
          <code className="font-mono text-electric-400">{"{{jobTitle}}"}</code> to personalise.
        </p>
      </div>

      {usesCalls(form.type) && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">
              Opening line the AI agent speaks
            </label>
            <textarea
              value={form.greeting}
              onChange={setField("greeting")}
              rows={2}
              className={inputClass}
              placeholder="Hi, it's Sam from Acme — do you have a quick moment?"
            />
          </div>
          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">Caller number</label>
            <select value={form.phoneNumberId} onChange={setField("phoneNumberId")} className={inputClass}>
              <option value="">
                {defaultNumber ? `Default number (${defaultNumber.number})` : "Platform number (no number of yours attached)"}
              </option>
              {phoneNumbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.number}{n.label ? ` · ${n.label}` : ""}
                </option>
              ))}
            </select>
            {phoneNumbersError && <p className="text-xs text-neon-red font-body mt-1">{phoneNumbersError}</p>}
            <p className="text-xs text-mist-500 font-body mt-1">
              Attach Jazz, Zong, Telenor, Ufone, PTCL, Twilio or Vapi numbers under{" "}
              <Link href="/settings" className="text-electric-400 hover:text-electric-300">Settings → Phone Numbers</Link>.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-mist-500 font-body mb-1.5">From (hour)</label>
              <input type="number" min={0} max={23} value={form.callStartHour}
                onChange={setNumberField("callStartHour")} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-mist-500 font-body mb-1.5">Until (hour)</label>
              <input type="number" min={1} max={24} value={form.callEndHour}
                onChange={setNumberField("callEndHour")} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-mist-500 font-body mb-1.5">Max concurrent</label>
              <input type="number" min={1} max={200} value={form.maxConcurrentCalls}
                onChange={setNumberField("maxConcurrentCalls")} className={inputClass} />
            </div>
          </div>
          <p className="text-xs text-mist-600 font-body">
            Leads outside the calling window are rescheduled to the next opening, not dropped.
          </p>
        </div>
      )}

      {usesEmail(form.type) && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">Email subject</label>
            <input type="text" value={form.emailSubject} onChange={setField("emailSubject")}
              className={inputClass} placeholder="Quick question about {{company}}" />
          </div>
          <div>
            <label className="block text-xs text-mist-500 font-body mb-1.5">Email body</label>
            <textarea value={form.emailTemplate} onChange={setField("emailTemplate")} rows={5}
              className={inputClass}
              placeholder={"Hi {{firstName}},\n\nI noticed {{company}} and wanted to reach out..."} />
          </div>
        </div>
      )}

      {usesSms(form.type) && (
        <div>
          <label className="block text-xs text-mist-500 font-body mb-1.5">
            SMS message
            <span className="ml-2 font-mono text-mist-600">
              {form.smsTemplate.length}/160
            </span>
          </label>
          <textarea value={form.smsTemplate} onChange={setField("smsTemplate")} rows={3}
            maxLength={160} className={inputClass}
            placeholder="Hi {{firstName}}, quick note from us about..." />
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" onClick={() => back(2)} className="px-5 py-3 text-sm">
          ← Back
        </Button>
        <Button variant="success" onClick={submit} disabled={submitting} className="flex-1 py-3">
          {submitting ? "Creating…" : "Create Campaign"}
        </Button>
      </div>
    </Card>
  );
}
