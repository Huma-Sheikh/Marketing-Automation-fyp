const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return res.json();
}

// AUTH
export async function register(email: string, password: string, businessName: string) {
  const data = await apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password, businessName }) });
  if (data.token) localStorage.setItem("auth_token", data.token);
  return data;
}
export async function login(email: string, password: string) {
  const data = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (data.token) localStorage.setItem("auth_token", data.token);
  return data;
}
export function logout() { localStorage.removeItem("auth_token"); window.location.href = "/login"; }
export function getToken() { return typeof window !== "undefined" ? localStorage.getItem("auth_token") : null; }

// LEADS
export const scrapeLeads = (platform: string, query: string, maxResults = 100) =>
  apiFetch("/leads/scrape", { method: "POST", body: JSON.stringify({ platform, query, maxResults }) });
export const getLeads = (status?: string) => apiFetch(`/leads${status ? "?status=" + status : ""}`);
export const getLead = (id: string) => apiFetch(`/leads/${id}`);
export const updateLead = (id: string, data: any) =>
  apiFetch(`/leads/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteLead = (id: string) => apiFetch(`/leads/${id}`, { method: "DELETE" });
export const importLeads = (leads: any[]) => apiFetch("/leads/import", { method: "POST", body: JSON.stringify({ leads }) });

// CAMPAIGNS
export const getCampaigns = () => apiFetch("/campaigns");
export const createCampaign = (data: any) => apiFetch("/campaigns", { method: "POST", body: JSON.stringify(data) });
export const startCampaign = (id: string) => apiFetch(`/campaigns/${id}/start`, { method: "POST" });
export const stopCampaign = (id: string) => apiFetch(`/campaigns/${id}/stop`, { method: "POST" });
export const getCampaignStats = (id: string) => apiFetch(`/campaigns/${id}/stats`);
export const deleteCampaign = (id: string) => apiFetch(`/campaigns/${id}`, { method: "DELETE" });

// BUSINESS
export type BusinessQuery = {
  location: string;
  category: string;
  region_code?: string;
  radius_meters?: number;
  min_rating?: number;
  max_rating?: number;
  max_results?: number;
};
export const getBusinessRegions = () => apiFetch("/business/regions");
export const searchBusinesses = (query: BusinessQuery) =>
  apiFetch("/business/search", { method: "POST", body: JSON.stringify(query) });
/** Low-rated businesses, worst first, each with a ready outreach script. */
export const findBusinessOpportunities = (query: BusinessQuery) =>
  apiFetch("/business/opportunities", { method: "POST", body: JSON.stringify(query) });

// ANALYTICS
export const getDashboard = () => apiFetch("/analytics/dashboard");

// BILLING
export const getSubscription = () => apiFetch("/billing/subscription");
export const createCheckout = (plan: string) => apiFetch("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
export const createPortal = () => apiFetch("/billing/portal", { method: "POST" });

// WHITE-LABEL
export const getAgencies = () => apiFetch("/whitelabel/agencies");
export const createAgency = (data: any) => apiFetch("/whitelabel/agencies", { method: "POST", body: JSON.stringify(data) });
export const updateAgency = (id: string, data: any) => apiFetch(`/whitelabel/agencies/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteAgency = (id: string) => apiFetch(`/whitelabel/agencies/${id}`, { method: "DELETE" });

// PHONE NUMBERS — caller numbers the AI voice agent dials out on
export type CredentialField = {
  key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string;
};
export type PhoneProvider = { id: string; label: string; description: string; fields: CredentialField[] };
export type PhoneCarrier = { id: string; label: string; country: string | null; providers: string[] };
export type PhoneCatalogue = { carriers: PhoneCarrier[]; providers: PhoneProvider[]; vapiWebhookUrl: string };
export type PhoneNumber = {
  id: string; label: string | null; number: string; carrier: string; provider: string;
  status: "pending" | "verified" | "failed"; statusMessage: string | null; verifiedAt: string | null;
  isDefault: boolean; createdAt: string;
  /** Masked: secrets come back as ••••last4, never in full. */
  credentials: Record<string, string>;
};
export type PhoneNumberInput = {
  carrier?: string; provider?: string; number?: string; label?: string; credentials?: Record<string, string>;
};
export const getPhoneCatalogue = (): Promise<PhoneCatalogue> => apiFetch("/phone-numbers/catalogue");
export const getPhoneNumbers = (): Promise<PhoneNumber[]> => apiFetch("/phone-numbers");
export const createPhoneNumber = (data: PhoneNumberInput): Promise<PhoneNumber> =>
  apiFetch("/phone-numbers", { method: "POST", body: JSON.stringify(data) });
export const updatePhoneNumber = (id: string, data: PhoneNumberInput): Promise<PhoneNumber> =>
  apiFetch(`/phone-numbers/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deletePhoneNumber = (id: string) => apiFetch(`/phone-numbers/${id}`, { method: "DELETE" });
export const verifyPhoneNumber = (id: string): Promise<PhoneNumber> =>
  apiFetch(`/phone-numbers/${id}/verify`, { method: "POST" });
export const setDefaultPhoneNumber = (id: string): Promise<PhoneNumber> =>
  apiFetch(`/phone-numbers/${id}/default`, { method: "POST" });

// AI HEALTH
export const checkHealth = () => apiFetch("/ai/health");
