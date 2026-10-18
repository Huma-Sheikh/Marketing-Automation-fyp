"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/http";
import { useLeads } from "@/features/leads/hooks/useLeads";
import { phoneNumbersApi } from "@/features/phone-numbers/api";
import type { PhoneNumber } from "@/features/phone-numbers/types";
import { campaignsApi } from "../api";
import { CAMPAIGN_TYPES, usesCalls, usesEmail, usesSms } from "../constants";

export type CampaignForm = {
  name: string;
  type: string;
  greeting: string;
  maxConcurrentCalls: number;
  callStartHour: number;
  callEndHour: number;
  emailSubject: string;
  emailTemplate: string;
  smsTemplate: string;
  /** "" = the tenant's default number at dial time (or the platform's if none). */
  phoneNumberId: string;
};

const INITIAL_FORM: CampaignForm = {
  name: "",
  type: "call",
  greeting: "",
  maxConcurrentCalls: 60,
  callStartHour: 9,
  callEndHour: 18,
  emailSubject: "",
  emailTemplate: "",
  smsTemplate: "",
  phoneNumberId: "",
};

/**
 * State machine for the 3-step new-campaign wizard (channel → audience →
 * content): form fields, lead targeting, verified caller numbers,
 * per-step validation and the final POST /campaigns.
 */
export function useCampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CampaignForm>(INITIAL_FORM);

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [phoneNumbersError, setPhoneNumbersError] = useState("");

  // Lead targeting. Without an explicit selection the backend falls back to
  // every lead with status "new", which means two campaigns would fight over
  // the same pool — so the picker defaults to "all unworked" but makes the
  // choice visible.
  const { leads, loading: leadsLoading, error: leadsError } = useLeads();
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [targetAll, setTargetAll] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    phoneNumbersApi.list()
      .then((n) => setPhoneNumbers((n || []).filter((x) => x.status === "verified")))
      .catch((e) => {
        setPhoneNumbers([]);
        setPhoneNumbersError(getErrorMessage(e, "Could not load your phone numbers"));
      });
  }, []);

  const setField = (k: keyof CampaignForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNumberField = (k: keyof CampaignForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));
  const setType = (type: string) => setForm((f) => ({ ...f, type }));

  const toggleLead = (id: string) =>
    setSelectedLeadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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

  const back = (to: number) => { setError(""); setStep(to); };

  const submit = async () => {
    if (usesEmail(form.type) && !form.emailSubject.trim()) {
      setError("Email campaigns need a subject line");
      return;
    }
    if (form.callStartHour >= form.callEndHour) {
      setError("Calling window must start before it ends");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await campaignsApi.create({
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
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = CAMPAIGN_TYPES.find((t) => t.id === form.type) || CAMPAIGN_TYPES[0];
  const targetCount = targetAll ? leads.filter((l) => l.status === "new").length : selectedLeadIds.length;
  const defaultNumber = phoneNumbers.find((n) => n.isDefault);

  return {
    step, form, error, submitting,
    setField, setNumberField, setType,
    leads, leadsLoading, leadsError, selectedLeadIds, toggleLead, targetAll, setTargetAll,
    phoneNumbers, phoneNumbersError, defaultNumber,
    selectedType, targetCount,
    goToStep2, goToStep3, back, submit,
    cancel: () => router.push("/campaigns"),
  };
}

export type CampaignWizard = ReturnType<typeof useCampaignWizard>;
