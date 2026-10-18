import { http } from "@/lib/http";
import type { DashboardData } from "./types";

/** Analytics endpoints. */
export const dashboardApi = {
  get: () => http.get<DashboardData>("/analytics/dashboard"),
};
