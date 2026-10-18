"use client";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { useToast } from "@/providers/ToastProvider";
import { phoneNumbersApi } from "../api";
import type { PhoneCatalogue, PhoneNumber, PhoneNumberDraft } from "../types";

const emptyDraft = (): PhoneNumberDraft => ({ carrier: "", provider: "", number: "", label: "", credentials: {}, stored: {} });

/**
 * Settings → Phone Numbers state: the provider catalogue, the tenant's
 * numbers, the attach/edit draft and the per-row actions (verify, make
 * default, remove). Carriers and credential fields all come from
 * GET /phone-numbers/catalogue.
 */
export function usePhoneNumbers() {
  const toast = useToast();
  const [catalogue, setCatalogue] = useState<PhoneCatalogue | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<PhoneNumberDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const [cat, list] = await Promise.all([phoneNumbersApi.catalogue(), phoneNumbersApi.list()]);
      setCatalogue(cat);
      setNumbers(list);
      setLoadError("");
    } catch (e) {
      setLoadError(getErrorMessage(e, "Could not load phone numbers"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const carrierOf = (id: string) => catalogue?.carriers.find((c) => c.id === id);
  const providerOf = (id: string) => catalogue?.providers.find((p) => p.id === id);

  const pakistan = catalogue?.carriers.filter((c) => c.country === "PK") ?? [];
  const international = catalogue?.carriers.filter((c) => c.country !== "PK") ?? [];

  const startNew = () => { setFormError(""); setDraft(emptyDraft()); };
  const cancelDraft = () => setDraft(null);
  const updateDraft = (patch: Partial<PhoneNumberDraft>) => setDraft((d) => d && { ...d, ...patch });

  const chooseCarrier = (carrierId: string) =>
    setDraft((d) => d && { ...d, carrier: carrierId, provider: carrierOf(carrierId)?.providers[0] ?? "", credentials: {} });

  const startEdit = (n: PhoneNumber) => {
    setFormError("");
    setDraft({
      id: n.id, carrier: n.carrier, provider: n.provider, number: n.number, label: n.label ?? "",
      // Non-secret fields are editable in place; secrets stay blank = "keep what's stored".
      credentials: Object.fromEntries(
        (providerOf(n.provider)?.fields ?? []).filter((f) => !f.secret && n.credentials[f.key]).map((f) => [f.key, n.credentials[f.key]]),
      ),
      stored: n.credentials,
    });
  };

  const replaceRow = (row: PhoneNumber) =>
    setNumbers((list) => {
      const others = list.filter((n) => n.id !== row.id).map((n) => (row.isDefault ? { ...n, isDefault: false } : n));
      return [...others, row].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt));
    });

  const save = async () => {
    if (!draft) return;
    if (!draft.carrier || !draft.provider) { setFormError("Choose who the number is with and how it connects"); return; }
    if (!draft.number.trim()) { setFormError("Enter the phone number"); return; }
    setSaving(true);
    setFormError("");
    try {
      const body = { label: draft.label, number: draft.number, credentials: draft.credentials };
      const row = draft.id
        ? await phoneNumbersApi.update(draft.id, body)
        : await phoneNumbersApi.create({ ...body, carrier: draft.carrier, provider: draft.provider });
      replaceRow(row);
      // Keep the form open on a failed verification so the fix is one edit away.
      if (row.status === "verified") setDraft(null);
      else startEdit(row);
      // Deleting/promoting defaults happens server-side; resync to be exact.
      phoneNumbersApi.list().then(setNumbers).catch(() => {});
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try { await fn(); setNumbers(await phoneNumbersApi.list()); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setBusyId(""); }
  };

  const verify = (id: string) => act(id, () => phoneNumbersApi.verify(id));
  const makeDefault = (id: string) => act(id, () => phoneNumbersApi.setDefault(id));

  const remove = (n: PhoneNumber) => {
    if (!confirm(`Remove ${n.number}? Campaigns pinned to it will refuse to start until you choose another number.`)) return;
    act(n.id, () => phoneNumbersApi.remove(n.id));
    if (draft?.id === n.id) setDraft(null);
  };

  return {
    catalogue, numbers, loading, loadError, reload: load,
    draft, saving, formError, busyId,
    carrierOf, providerOf, pakistan, international,
    startNew, startEdit, cancelDraft, updateDraft, chooseCarrier, save,
    verify, makeDefault, remove,
  };
}
