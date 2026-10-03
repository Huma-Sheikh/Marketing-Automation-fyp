"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { PhoneNumber, createCampaign, getLeads, getPhoneNumbers } from "@/lib/api";

const TYPES = [
  { id: "call",  label: "Calls Only",        icon: "📞", desc: "AI voice calls to leads",       color: "#10B981" },
  { id: "email", label: "Email Only",        icon: "✉",  desc: "Personalized email outreach",   color: "#3B82F6" },
  { id: "sms",   label: "SMS Only",          icon: "💬", desc: "Short message campaigns",       color: "#F59E0B" },
  { id: "mixed", label: "Call + Email + SMS", icon: "⚡", desc: "Maximum reach across channels", color: "#8B5CF6" },
];

const usesCalls  = (t: string) => t === "call" || t === "mixed";
const usesEmail  = (t: string) => t === "email" || t === "mixed";
const usesSms    = (t: string) => t === "sms" || t === "mixed";

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

const inputClass =
  "input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body placeholder-ink-600";

export default function NewCampaignPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    type: "call",
    greeting: "",
    maxConcurrentCalls: 60,
    callStartHour: 9,
    callEndHour: 18,
    emailSubject: "",
    emailTemplate: "",
    smsTemplate: "",
    // "" = the tenant's default number at dial time (or the platform's if none).
    phoneNumberId: "",
  });
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  // Lead targeting. Without an explicit selection the backend falls back to
  // every lead with status "new", which means two campaigns would fight over
  // the same pool — so the picker defaults to "all unworked" but makes the
  // choice visible.
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [targetAll, setTargetAll] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    getLeads()
      .then((l) => setLeads(l || []))
      .catch(() => setLeads([]))
      .finally(() => setLeadsLoading(false));
    getPhoneNumbers()
      .then((n) => setPhoneNumbers((n || []).filter((x) => x.status === "verified")))
      .catch(() => setPhoneNumbers([]));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setN = (k: string) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  const toggleLead = (id: string) =>
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const goToStep2 = () => {
    if (!form.name.trim()) { setError("Campaign name is required"); return; }
    setError(""); setStep(2);
  };

  const goToStep3 = () => {
    if (!targetAll && selectedLeadIds.length === 0) {
      setError("Select at least one lead, or switch back to all unworked leads");
      return;
    }
    setError(""); setStep(3);
  };

  const handleSubmit = async () => {
    if (usesEmail(form.type) && !form.emailSubject.trim()) {
      setError("Email campaigns need a subject line");
      return;
    }
    if (form.callStartHour >= form.callEndHour) {
      setError("Calling window must start before it ends");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createCampaign({
        name: form.name,
        type: form.type,
        settings: {
          ...form,
          // Only send the channel settings this campaign actually uses.
          ...(usesEmail(form.type) ? {} : { emailSubject: undefined, emailTemplate: undefined }),
          ...(usesSms(form.type) ? {} : { smsTemplate: undefined }),
          leadIds: targetAll ? undefined : selectedLeadIds,
          phoneNumberId: usesCalls(form.type) && form.phoneNumberId ? form.phoneNumberId : undefined,
        },
      });
      router.push("/campaigns");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedType = TYPES.find((t) => t.id === form.type) || TYPES[0];
  const targetCount = targetAll
    ? leads.filter((l) => l.status === "new").length
    : selectedLeadIds.length;

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="max-w-2xl">
          <div className="mb-8">
            <button
              onClick={() => router.push("/campaigns")}
              className="text-mist-500 hover:text-mist-300 text-sm font-body flex items-center gap-1 mb-4 transition-colors"
            >
              ← Back to campaigns
            </button>
            <h1 className="font-display font-bold text-2xl text-mist-100">New Campaign</h1>
            <p className="text-mist-500 text-sm font-body mt-1">
              Set up your outreach campaign in 3 steps
            </p>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <Step n={1} label="Channel" active={step === 1} done={step > 1} />
            <div className="flex-1 h-px bg-ink-700" />
            <Step n={2} label="Audience" active={step === 2} done={step > 2} />
            <div className="flex-1 h-px bg-ink-700" />
            <Step n={3} label="Content" active={step === 3} done={false} />
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-4 py-3 rounded-xl font-body">
              <span>✕</span> {error}
            </div>
          )}

          {/* ── Step 1: name + channel ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="glass rounded-2xl p-6 animate-slide-up">
              <h2 className="font-display font-semibold text-mist-200 mb-5">Campaign Basics</h2>

              <label className="block text-xs text-mist-500 font-body mb-1.5">Campaign name</label>
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                onKeyDown={(e) => e.key === "Enter" && goToStep2()}
                className={inputClass}
                placeholder="e.g. Q1 Dubai dental outreach"
              />

              <label className="block text-xs text-mist-500 font-body mt-5 mb-2">Channel</label>
              <div className="grid grid-cols-2 gap-3">
                {TYPES.map((t) => {
                  const active = form.type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                      className={`text-left p-4 rounded-xl border transition-all duration-200 ${
                        active ? "border-current" : "border-ink-600 hover:border-ink-500"
                      }`}
                      style={active ? { background: `${t.color}18`, borderColor: `${t.color}55` } : {}}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{t.icon}</span>
                        <span
                          className="font-display font-semibold text-sm"
                          style={{ color: active ? t.color : "#C4D2F5" }}
                        >
                          {t.label}
                        </span>
                      </div>
                      <div className="text-xs text-mist-500 font-body">{t.desc}</div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goToStep2}
                className="btn-press mt-6 w-full bg-electric-600 hover:bg-electric-500 text-white py-3 rounded-xl font-display font-semibold transition-all shadow-glow-blue"
              >
                Next →
              </button>
            </div>
          )}

          {/* ── Step 2: audience ───────────────────────────────────────────── */}
          {step === 2 && (
            <div className="glass rounded-2xl p-6 animate-slide-up">
              <h2 className="font-display font-semibold text-mist-200 mb-1">Audience</h2>
              <p className="text-xs text-mist-500 font-body mb-5">
                {selectedType.icon} {selectedType.label} · {targetCount} lead{targetCount === 1 ? "" : "s"} targeted
              </p>

              <div className="space-y-2 mb-4">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    checked={targetAll}
                    onChange={() => setTargetAll(true)}
                    className="mt-1 accent-electric-500"
                  />
                  <span className="text-sm text-mist-300 font-body">
                    All unworked leads
                    <span className="block text-xs text-mist-600 mt-0.5">
                      Every lead still marked “new”. Note that a second campaign started
                      this way will target the same people.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    checked={!targetAll}
                    onChange={() => setTargetAll(false)}
                    className="mt-1 accent-electric-500"
                  />
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
                  ) : leads.length === 0 ? (
                    <div className="px-4 py-6 text-center text-mist-600 text-sm font-body">
                      No leads yet — find some on the Leads or Business Search page first.
                    </div>
                  ) : (
                    leads.map((l) => (
                      <label
                        key={l.id}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-ink-800/40 transition-colors"
                      >
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
                <button
                  onClick={() => { setError(""); setStep(1); }}
                  className="btn-press px-5 py-3 rounded-xl text-sm font-display font-semibold text-mist-400 border border-ink-600 hover:text-mist-200 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={goToStep3}
                  className="btn-press flex-1 bg-electric-600 hover:bg-electric-500 text-white py-3 rounded-xl font-display font-semibold transition-all shadow-glow-blue"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: content ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="glass rounded-2xl p-6 animate-slide-up space-y-5">
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
                      onChange={set("greeting")}
                      rows={2}
                      className={inputClass}
                      placeholder="Hi, it's Sam from Acme — do you have a quick moment?"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mist-500 font-body mb-1.5">Caller number</label>
                    <select value={form.phoneNumberId} onChange={set("phoneNumberId")} className={inputClass}>
                      <option value="">
                        {(() => {
                          const d = phoneNumbers.find((n) => n.isDefault);
                          return d ? `Default number (${d.number})` : "Platform number (no number of yours attached)";
                        })()}
                      </option>
                      {phoneNumbers.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.number}{n.label ? ` · ${n.label}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-mist-500 font-body mt-1">
                      Attach Jazz, Zong, Telenor, Ufone, PTCL, Twilio or Vapi numbers under{" "}
                      <a href="/settings" className="text-electric-400 hover:text-electric-300">Settings → Phone Numbers</a>.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-mist-500 font-body mb-1.5">From (hour)</label>
                      <input type="number" min={0} max={23} value={form.callStartHour}
                        onChange={setN("callStartHour")} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-mist-500 font-body mb-1.5">Until (hour)</label>
                      <input type="number" min={1} max={24} value={form.callEndHour}
                        onChange={setN("callEndHour")} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-mist-500 font-body mb-1.5">Max concurrent</label>
                      <input type="number" min={1} max={200} value={form.maxConcurrentCalls}
                        onChange={setN("maxConcurrentCalls")} className={inputClass} />
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
                    <input type="text" value={form.emailSubject} onChange={set("emailSubject")}
                      className={inputClass} placeholder="Quick question about {{company}}" />
                  </div>
                  <div>
                    <label className="block text-xs text-mist-500 font-body mb-1.5">Email body</label>
                    <textarea value={form.emailTemplate} onChange={set("emailTemplate")} rows={5}
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
                  <textarea value={form.smsTemplate} onChange={set("smsTemplate")} rows={3}
                    maxLength={160} className={inputClass}
                    placeholder="Hi {{firstName}}, quick note from us about..." />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setError(""); setStep(2); }}
                  className="btn-press px-5 py-3 rounded-xl text-sm font-display font-semibold text-mist-400 border border-ink-600 hover:text-mist-200 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-press flex-1 bg-neon-green/80 hover:bg-neon-green text-ink-950 py-3 rounded-xl font-display font-bold disabled:opacity-40 transition-all"
                >
                  {loading ? "Creating…" : "Create Campaign"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
