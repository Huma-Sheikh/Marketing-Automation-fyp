"use client";
import { useState } from "react";
import { Alert, Card, SectionTitle, SkeletonList, inputClassCompact as inputClass } from "@/components/ui";
import { usePhoneNumbers } from "../hooks/usePhoneNumbers";

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  verified: { color: "#10B981", label: "Verified" },
  failed:   { color: "#EF4444", label: "Needs attention" },
  pending:  { color: "#F59E0B", label: "Checking" },
};

/**
 * Settings → Phone Numbers: the numbers the AI voice agent dials out on.
 * Carriers, connection types and credential fields all come from
 * GET /phone-numbers/catalogue, so this component has no provider list of its own.
 */
export function PhoneNumbers() {
  const {
    catalogue, numbers, loading, loadError, reload,
    draft, saving, formError, busyId,
    carrierOf, providerOf, pakistan, international,
    startNew, startEdit, cancelDraft, updateDraft, chooseCarrier, save,
    verify, makeDefault, remove,
  } = usePhoneNumbers();
  const [copied, setCopied] = useState(false);

  const copyWebhook = async () => {
    if (!catalogue) return;
    try { await navigator.clipboard.writeText(catalogue.vapiWebhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard blocked — the URL is visible to copy by hand */ }
  };

  const draftCarrier = draft ? carrierOf(draft.carrier) : undefined;
  const draftProvider = draft ? providerOf(draft.provider) : undefined;
  const editing = !!draft?.id;

  return (
    <Card className="p-6 border border-ink-600/30">
      <div className="flex items-center justify-between mb-1">
        <SectionTitle>Phone Numbers</SectionTitle>
        {!draft && catalogue && (
          <button
            onClick={startNew}
            className="btn-press text-xs font-display font-semibold bg-electric-600 hover:bg-electric-500 text-white px-3 py-1.5 rounded-lg transition-all"
          >
            + Attach number
          </button>
        )}
      </div>
      <p className="text-sm text-mist-500 font-body mb-5">
        The numbers your AI agent calls from. Your default number is used unless a campaign picks another one.
      </p>

      {loading ? (
        <div className="space-y-2"><SkeletonList count={2} className="h-16 rounded-xl" /></div>
      ) : loadError ? (
        <Alert icon={false} onRetry={reload}>{loadError}</Alert>
      ) : (
        <div className="space-y-2">
          {numbers.length === 0 && !draft && (
            <div className="px-4 py-5 bg-ink-800/50 rounded-xl border border-dashed border-ink-600 text-center">
              <p className="text-sm text-mist-300 font-body">No numbers attached yet</p>
              <p className="text-xs text-mist-500 font-body mt-1">
                Until you attach one, calls go out on the platform&apos;s shared number, if one is configured.
              </p>
            </div>
          )}

          {numbers.map((n) => {
            const st = STATUS_STYLE[n.status] ?? STATUS_STYLE.pending;
            const busy = busyId === n.id;
            return (
              <div key={n.id} className="px-4 py-3 bg-ink-800/50 rounded-xl border border-ink-600/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-mist-100">{n.number}</span>
                      {n.isDefault && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-electric-400 bg-electric-500/10 border border-electric-500/30 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: st.color, background: `${st.color}18` }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="text-xs text-mist-500 font-body mt-1">
                      {n.label ? <span className="text-mist-300">{n.label} · </span> : null}
                      {carrierOf(n.carrier)?.label ?? n.carrier} · {providerOf(n.provider)?.label ?? n.provider}
                    </div>
                    {n.statusMessage && (
                      <div className="text-xs font-body mt-1" style={{ color: n.status === "verified" ? "#6B82A8" : st.color }}>
                        {n.statusMessage}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs font-body">
                    {n.status === "verified" && !n.isDefault && (
                      <button disabled={busy} onClick={() => makeDefault(n.id)}
                        className="text-electric-400 hover:text-electric-300 disabled:opacity-40">Make default</button>
                    )}
                    <button disabled={busy} onClick={() => verify(n.id)}
                      className="text-mist-400 hover:text-mist-200 disabled:opacity-40">{busy ? "…" : "Verify"}</button>
                    <button disabled={busy} onClick={() => startEdit(n)}
                      className="text-mist-400 hover:text-mist-200 disabled:opacity-40">Edit</button>
                    <button disabled={busy} onClick={() => remove(n)}
                      className="text-neon-red/80 hover:text-neon-red disabled:opacity-40">Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Attach / edit form ─────────────────────────────────────────────── */}
      {draft && catalogue && (
        <div className="mt-4 p-5 rounded-xl border border-electric-500/30 bg-ink-900/60 space-y-5 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-mist-200 text-sm">
              {editing ? `Edit ${draft.number}` : "Attach a number"}
            </h3>
            <button onClick={cancelDraft} className="text-xs text-mist-500 hover:text-mist-300 font-body">Cancel</button>
          </div>

          <Alert icon={false}>{formError}</Alert>

          {/* 1. Who is the number with */}
          {!editing && (
            <div>
              <label className="block text-xs text-mist-500 font-body mb-2">1 · Who is the number with?</label>
              {[{ title: "Pakistan", list: pakistan }, { title: "International platforms", list: international }].map(({ title, list }) => (
                <div key={title} className="mb-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-mist-500 mb-1.5">{title}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((c) => {
                      const active = draft.carrier === c.id;
                      return (
                        <button key={c.id} onClick={() => chooseCarrier(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-body border transition-all ${
                            active ? "border-electric-500 bg-electric-500/15 text-electric-400" : "border-ink-600 text-mist-300 hover:border-ink-500"
                          }`}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 2. How it connects */}
          {draftCarrier && (
            <div>
              <label className="block text-xs text-mist-500 font-body mb-2">
                {editing ? "Connection" : "2 · How should the agent place calls from it?"}
              </label>
              <div className="space-y-2">
                {(editing ? [draft.provider] : draftCarrier.providers).map((pid) => {
                  const p = providerOf(pid);
                  if (!p) return null;
                  const active = draft.provider === pid;
                  return (
                    <label key={pid}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        active ? "border-electric-500/60 bg-electric-500/10" : "border-ink-600 hover:border-ink-500"
                      }`}>
                      <input type="radio" checked={active} disabled={editing}
                        onChange={() => updateDraft({ provider: pid, credentials: {} })}
                        className="mt-1 accent-electric-500" />
                      <span>
                        <span className="block text-sm text-mist-200 font-body font-medium">{p.label}</span>
                        <span className="block text-xs text-mist-500 font-body mt-0.5">{p.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Number + credentials */}
          {draftProvider && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-mist-500 font-body mb-1.5">Phone number</label>
                  <input value={draft.number} onChange={(e) => updateDraft({ number: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder={draftCarrier?.country === "PK" ? "0300 1234567 or +923001234567" : "+14155550100"} />
                </div>
                <div>
                  <label className="block text-xs text-mist-500 font-body mb-1.5">Label (optional)</label>
                  <input value={draft.label} onChange={(e) => updateDraft({ label: e.target.value })}
                    className={inputClass} placeholder="e.g. Karachi sales line" maxLength={60} />
                </div>
              </div>

              {draftProvider.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs text-mist-500 font-body mb-1.5">
                    {f.label}{f.required ? "" : " (optional)"}
                  </label>
                  <input
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    value={draft.credentials[f.key] ?? ""}
                    onChange={(e) => updateDraft({ credentials: { ...draft.credentials, [f.key]: e.target.value } })}
                    className={`${inputClass} font-mono`}
                    placeholder={f.secret && draft.stored[f.key] ? `${draft.stored[f.key]} — leave blank to keep` : f.placeholder}
                  />
                  {f.help && <p className="text-xs text-mist-500 font-body mt-1">{f.help}</p>}
                </div>
              ))}

              {draft.provider === "vapi" && (
                <div className="bg-ink-800/60 border border-ink-600 rounded-xl px-4 py-3">
                  <div className="text-xs text-mist-500 font-body mb-1">Server URL to set on your Vapi assistant or number</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate font-mono text-xs text-electric-400">{catalogue.vapiWebhookUrl}</code>
                    <button onClick={copyWebhook} className="text-xs text-mist-400 hover:text-mist-200 font-body flex-shrink-0">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              <button onClick={save} disabled={saving}
                className="btn-press w-full bg-electric-600 hover:bg-electric-500 text-white py-2.5 rounded-xl font-display font-semibold text-sm disabled:opacity-50 transition-all">
                {saving ? "Verifying with provider…" : editing ? "Save & verify" : "Attach & verify"}
              </button>
              <p className="text-xs text-mist-500 font-body text-center">
                Credentials are encrypted on the server and never shown again in full.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
