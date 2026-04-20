"use client";
import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createCampaign } from "@/lib/api";

const TYPES = [
  { id: "call",  label: "Calls Only",       icon: "📞", desc: "AI voice calls to leads",        color: "#10B981" },
  { id: "email", label: "Email Only",        icon: "✉",  desc: "Personalized email outreach",    color: "#3B82F6" },
  { id: "sms",   label: "SMS Only",          icon: "💬", desc: "Short message campaigns",        color: "#F59E0B" },
  { id: "mixed", label: "Call + Email + SMS",icon: "⚡", desc: "Maximum reach across channels",  color: "#8B5CF6" },
];

type StepProps = {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
};

function Step({ n, label, active, done }: StepProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
          done
            ? "bg-neon-green text-ink-950"
            : active
            ? "bg-electric-600 text-white shadow-glow-blue"
            : "bg-ink-700 text-mist-600"
        }`}
      >
        {done ? "✓" : n}
      </div>
      <span
        className={`text-sm font-body ${
          active ? "text-mist-200 font-medium" : "text-mist-600"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default function NewCampaignPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    type: "call",
    maxConcurrentCalls: 60,
    callStartHour: 9,
    callEndHour: 18,
    emailSubject: "",
    emailTemplate: "",
    smsTemplate: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const set = (k: string) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const setN = (k: string) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Campaign name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createCampaign({
        name: form.name,
        type: form.type,
        settings: form,
      });
      router.push("/campaigns");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedType =
    TYPES.find((t) => t.id === form.type) || TYPES[0];

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
            <h1 className="font-display font-bold text-2xl text-mist-100">
              New Campaign
            </h1>
            <p className="text-mist-500 text-sm font-body mt-1">
              Set up your outreach campaign in 3 steps
            </p>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <Step n={1} label="Basics" active={step === 1} done={step > 1} />
            <div className="flex-1 h-px bg-ink-700" />
            <Step n={2} label="Channel" active={step === 2} done={step > 2} />
            <div className="flex-1 h-px bg-ink-700" />
            <Step n={3} label="Content" active={step === 3} done={false} />
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="glass rounded-2xl p-6 animate-slide-up">
              <h2 className="font-display font-semibold text-mist-200 mb-5">
                Campaign Basics
              </h2>
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                className="w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100"
                placeholder="Campaign Name"
              />
              <button
                onClick={() => setStep(2)}
                className="mt-4 w-full bg-electric-600 text-white py-3 rounded-xl"
              >
                Next →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="glass rounded-2xl p-6">
              <h2 className="text-mist-200 mb-4">
                {selectedType.icon} {selectedType.label}
              </h2>
              <button
                onClick={() => setStep(3)}
                className="w-full bg-electric-600 text-white py-3 rounded-xl"
              >
                Next →
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="glass rounded-2xl p-6">
              <button
                onClick={handleSubmit}
                className="w-full bg-neon-green text-black py-3 rounded-xl"
              >
                Create Campaign
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}