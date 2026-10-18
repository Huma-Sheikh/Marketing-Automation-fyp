import { CampaignSettings } from '../campaigns/campaign.types';

/** The lead fields outreach jobs need. Jobs carry a snapshot, not a database reference. */
export interface OutreachLead {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
}

/** `calling` queue → `dial-lead`. */
export interface DialJobData {
  leadId: string;
  phoneNumber: string;
  campaignId: string;
  userId: string;
  leadName: string;
  settings: CampaignSettings;
}

/** `email` queue → `send-email`. */
export interface EmailJobData {
  lead: OutreachLead;
  subject: string;
  template: string;
  campaignId: string;
}

/** `sms` queue → `send-sms`. */
export interface SmsJobData {
  lead: OutreachLead;
  template: string;
  campaignId: string;
}
