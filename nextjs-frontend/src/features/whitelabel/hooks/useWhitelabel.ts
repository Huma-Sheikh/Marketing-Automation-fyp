"use client";
import React, { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { useToast } from "@/providers/ToastProvider";
import { whitelabelApi } from "../api";
import type { Agency, AgencyInput } from "../types";

const EMPTY_FORM: AgencyInput = { agencyName: "", customDomain: "", primaryColor: "#2563EB", logoUrl: "" };

/** White-label agencies: list, create form state, and delete. */
export function useWhitelabel() {
  const toast = useToast();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AgencyInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const setField = (k: keyof AgencyInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    try {
      setAgencies(await whitelabelApi.list());
      setError("");
    } catch (e) {
      setError(getErrorMessage(e, "Could not load agencies"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await whitelabelApi.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this agency?")) return;
    try {
      await whitelabelApi.remove(id);
      setAgencies((a) => a.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not delete agency"));
    }
  };

  return { agencies, loading, error, reload: load, showForm, setShowForm, form, setField, saving, create, remove };
}
