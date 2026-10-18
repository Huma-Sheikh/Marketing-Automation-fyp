import { http } from "@/lib/http";
import type { Lead, LeadImport, ScrapeResult } from "./types";

/** Lead endpoints (scraping, CRUD, bulk import). */
export const leadsApi = {
  scrape: (platform: string, query: string, maxResults = 100) =>
    http.post<ScrapeResult>("/leads/scrape", { platform, query, maxResults }),
  list: (status?: string) => http.get<Lead[]>(`/leads${status ? "?status=" + status : ""}`),
  get: (id: string) => http.get<Lead>(`/leads/${id}`),
  update: (id: string, data: Partial<Lead>) => http.put<Lead>(`/leads/${id}`, data),
  remove: (id: string) => http.delete(`/leads/${id}`),
  import: (leads: LeadImport[]) => http.post<{ count?: number }>("/leads/import", { leads }),
};
