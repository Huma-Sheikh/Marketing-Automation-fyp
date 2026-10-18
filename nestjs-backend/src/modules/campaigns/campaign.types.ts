/** Delivery channels a campaign can use. `mixed` uses all three. */
export const CAMPAIGN_TYPES = ['call', 'email', 'sms', 'mixed'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export type CampaignChannel = Exclude<CampaignType, 'mixed'>;

export const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'completed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Whether a campaign of `type` sends on `channel`. */
export const usesChannel = (type: string, channel: CampaignChannel) => type === channel || type === 'mixed';

/**
 * The free-form `settings` JSON stored on a campaign. Every field is optional;
 * the service applies a default when one is missing. Stored as-is, so older
 * campaigns with extra keys keep working.
 */
export interface CampaignSettings {
  /** Explicit audience. Without it the campaign targets every lead with status `new`. */
  leadIds?: string[];

  // Calls
  /** A tenant phone number to dial from; omitted = the tenant's default, then the platform's. */
  phoneNumberId?: string;
  /** Opening line the agent speaks. */
  greeting?: string;
  maxConcurrentCalls?: number;
  /** Calling window, server-local hours [start, end). Defaults 9-18. */
  callStartHour?: number;
  callEndHour?: number;
  /** Per-campaign override of the tenant's sales profile (see User.salesProfile). */
  company?: Record<string, any>;

  // Email / SMS
  emailSubject?: string;
  emailTemplate?: string;
  smsTemplate?: string;

  [key: string]: unknown;
}
