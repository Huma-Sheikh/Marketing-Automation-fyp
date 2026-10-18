/** Branding served when a domain has no active white-label agency. */
export const DEFAULT_BRANDING = {
  agencyName: 'Marketing Platform',
  primaryColor: '#1F3864',
  logoUrl: null,
  isWhiteLabel: false,
} as const;

export const DEFAULT_AGENCY_COLOR = '#2563EB';

export const DEFAULT_AGENCY_LIMITS = { maxCalls: 1000, maxLeads: 5000, maxCampaigns: 10, maxUsers: 5 };

export const AGENCY_STATUSES = ['active', 'suspended'] as const;
