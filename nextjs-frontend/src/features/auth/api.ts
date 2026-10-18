import { http } from "@/lib/http";
import type { AuthResponse } from "./types";

/** Auth endpoints. Token persistence is handled by AuthProvider, not here. */
export const authApi = {
  register: (email: string, password: string, businessName: string) =>
    http.post<AuthResponse>("/auth/register", { email, password, businessName }),
  login: (email: string, password: string) =>
    http.post<AuthResponse>("/auth/login", { email, password }),
};
