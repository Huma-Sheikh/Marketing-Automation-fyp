/**
 * Browser persistence for the JWT and the signed-in user. All access is
 * guarded so these helpers are safe to call during server rendering.
 */

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

const hasWindow = () => typeof window !== "undefined";

export function getToken(): string | null {
  return hasWindow() ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string): void {
  if (hasWindow()) localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser<T>(): T | null {
  if (!hasWindow()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown): void {
  if (hasWindow() && user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Removes the token and cached user (used by logout and on 401). */
export function clearSession(): void {
  if (!hasWindow()) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
