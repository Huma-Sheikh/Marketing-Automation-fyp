import { http } from "@/lib/http";
import type { BusinessQuery, BusinessSearchResult, Region } from "./types";

/** Google Places business search endpoints. */
export const businessApi = {
  regions: () => http.get<Region[]>("/business/regions"),
  search: (query: BusinessQuery) => http.post<BusinessSearchResult>("/business/search", query),
  /** Low-rated businesses, worst first, each with a ready outreach script. */
  opportunities: (query: BusinessQuery) =>
    http.post<BusinessSearchResult>("/business/opportunities", query),
};
