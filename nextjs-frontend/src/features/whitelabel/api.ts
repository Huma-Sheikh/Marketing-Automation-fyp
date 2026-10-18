import { http } from "@/lib/http";
import type { Agency, AgencyInput } from "./types";

/** White-label agency endpoints. */
export const whitelabelApi = {
  list: () => http.get<Agency[]>("/whitelabel/agencies"),
  create: (data: AgencyInput) => http.post<Agency>("/whitelabel/agencies", data),
  update: (id: string, data: Partial<AgencyInput>) => http.put<Agency>(`/whitelabel/agencies/${id}`, data),
  remove: (id: string) => http.delete(`/whitelabel/agencies/${id}`),
};
