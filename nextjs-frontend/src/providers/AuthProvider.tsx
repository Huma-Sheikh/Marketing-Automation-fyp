"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/features/auth/api";
import type { AuthResponse, AuthUser } from "@/features/auth/types";
import { clearSession, getStoredUser, getToken, setStoredUser, setToken } from "@/lib/tokenStorage";

type AuthContextValue = {
  /** JWT, or null when signed out. */
  token: string | null;
  /** User returned by the last login/register (cached in localStorage). */
  user: AuthUser | null;
  /** False until the token has been read from storage on the client. */
  ready: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string, businessName: string) => Promise<AuthResponse>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the session (JWT + user) and exposes login/register/logout.
 * The token lives in localStorage under "auth_token", same as before, so the
 * HTTP client can attach it to every request.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTokenState(getToken());
    setUser(getStoredUser<AuthUser>());
    setReady(true);
  }, []);

  const persist = useCallback((data: AuthResponse) => {
    if (data?.token) {
      setToken(data.token);
      setTokenState(data.token);
    }
    if (data?.user) {
      setStoredUser(data.user);
      setUser(data.user);
    }
    return data;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => persist(await authApi.login(email, password)),
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, businessName: string) =>
      persist(await authApi.register(email, password, businessName)),
    [persist],
  );

  const logout = useCallback(() => {
    clearSession();
    setTokenState(null);
    setUser(null);
    // Full navigation so no in-memory page state survives sign-out.
    window.location.href = "/login";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, ready, isAuthenticated: !!token, login, register, logout }),
    [token, user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth session. Must be used under <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
