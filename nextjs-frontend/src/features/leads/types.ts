export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "rejected";

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  company?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  score: number;
  status: LeadStatus | string;
  [key: string]: any;
};

/** One row accepted by POST /leads/import. */
export type LeadImport = Record<string, any>;

export type ScrapeResult = { leads?: Lead[]; [key: string]: any };
