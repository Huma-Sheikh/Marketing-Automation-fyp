"use client";
import { Alert } from "@/components/ui";
import { AudienceStep } from "@/features/campaigns/components/AudienceStep";
import { ChannelStep } from "@/features/campaigns/components/ChannelStep";
import { ContentStep } from "@/features/campaigns/components/ContentStep";
import { WizardSteps } from "@/features/campaigns/components/WizardSteps";
import { useCampaignWizard } from "@/features/campaigns/hooks/useCampaignWizard";

export default function NewCampaignPage() {
  const wizard = useCampaignWizard();
  const { step, error, cancel } = wizard;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <button
          onClick={cancel}
          className="text-mist-500 hover:text-mist-300 text-sm font-body flex items-center gap-1 mb-4 transition-colors"
        >
          ← Back to campaigns
        </button>
        <h1 className="font-display font-bold text-2xl text-mist-100">New Campaign</h1>
        <p className="text-mist-500 text-sm font-body mt-1">
          Set up your outreach campaign in 3 steps
        </p>
      </div>

      <WizardSteps step={step} />

      <Alert className="mb-5">{error}</Alert>

      {step === 1 && <ChannelStep wizard={wizard} />}
      {step === 2 && <AudienceStep wizard={wizard} />}
      {step === 3 && <ContentStep wizard={wizard} />}
    </div>
  );
}
