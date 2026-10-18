import { http } from "@/lib/http";
import type { Campaign, CreateCampaignInput } from "./types";

/** Campaign endpoints. */
export const campaignsApi = {
  list: () => http.get<Campaign[]>("/campaigns"),
  create: (data: CreateCampaignInput) => http.post<Campaign>("/campaigns", data),
  start: (id: string) => http.post(`/campaigns/${id}/start`),
  stop: (id: string) => http.post(`/campaigns/${id}/stop`),
  stats: (id: string) => http.get(`/campaigns/${id}/stats`),
  remove: (id: string) => http.delete(`/campaigns/${id}`),
};
