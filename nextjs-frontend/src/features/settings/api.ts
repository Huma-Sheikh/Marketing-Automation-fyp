import { http } from "@/lib/http";

/** Map of AI service name to status ("healthy" | "unavailable" | ...). */
export type AiHealth = Record<string, string>;

/** AI microservice health endpoint. */
export const settingsApi = {
  aiHealth: () => http.get<AiHealth>("/ai/health"),
};
