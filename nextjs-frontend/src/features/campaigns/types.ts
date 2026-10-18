export type CampaignType = "call" | "email" | "sms" | "mixed";
export type CampaignStatus = "draft" | "running" | "paused" | "completed" | string;

export type Campaign = {
  id: string;
  name: string;
  type: CampaignType | string;
  status: CampaignStatus;
  totalLeads?: number;
  contactedCount?: number;
  convertedCount?: number;
  [key: string]: any;
};

export type CreateCampaignInput = {
  name: string;
  type: string;
  settings: Record<string, any>;
};
