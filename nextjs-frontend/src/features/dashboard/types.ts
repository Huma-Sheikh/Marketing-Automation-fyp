import type { Campaign } from "@/features/campaigns/types";

/** GET /analytics/dashboard response (the fields the UI reads). */
export type DashboardData = {
  activeCalls?: number;
  calls?: {
    today?: number;
    week?: number;
    month?: number;
    completed?: number;
    avgDurationSeconds?: number;
  };
  leads?: {
    total?: number;
    newLeads?: number;
    qualified?: number;
    converted?: number;
    conversionRate?: string | number;
  };
  campaigns?: { recent?: Campaign[] };
  aiHealth?: Record<string, string>;
  [key: string]: any;
};
