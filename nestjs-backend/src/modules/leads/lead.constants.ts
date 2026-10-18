/**
 * Every status a lead can hold. The first five are the sales pipeline the UI
 * filters on; the rest are written by the dialler from call outcomes (the LLM
 * qualifier and Twilio/Vapi end states), see CallingService.
 */
export const LEAD_STATUSES = [
  'new', 'contacted', 'qualified', 'converted', 'rejected',
  'not-interested', 'callback', 'voicemail', 'no-answer', 'busy', 'failed', 'canceled',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Default number of profiles requested per scrape. */
export const DEFAULT_SCRAPE_RESULTS = 100;
