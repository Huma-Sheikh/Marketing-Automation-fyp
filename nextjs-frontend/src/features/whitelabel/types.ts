export type Agency = {
  id: string;
  agencyName: string;
  customDomain?: string | null;
  primaryColor: string;
  logoUrl?: string | null;
  status: string;
  [key: string]: any;
};

export type AgencyInput = {
  agencyName: string;
  customDomain: string;
  primaryColor: string;
  logoUrl: string;
};
