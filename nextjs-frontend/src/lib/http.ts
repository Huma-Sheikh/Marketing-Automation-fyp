import { config } from "./config";
import { clearSession, getToken } from "./tokenStorage";

/**
 * Error thrown for any non-2xx response. `message` is the backend's single
 * human-readable message and is safe to show to users.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errors?: string[];

  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

/** Shape of every error body the backend returns. */
type ApiErrorBody = {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  errors?: string[];
};

/** Extracts a user-facing message from anything caught in a try/catch. */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

async function parseBody(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Shared fetch wrapper: prefixes the API base URL, sends JSON with the JWT,
 * parses the response and throws `ApiError` on failure.
 *
 * A 401 on a request that carried a token means the session expired: the
 * token is cleared and the browser is sent to /login. A 401 without a token
 * (e.g. wrong password on /auth/login) is thrown like any other error.
 */
export async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }

  const body = await parseBody(res);

  if (!res.ok) {
    if (res.status === 401 && token && typeof window !== "undefined") {
      clearSession();
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    const err = (body && typeof body === "object" ? body : {}) as ApiErrorBody;
    const message = Array.isArray(err.message) ? err.message.join(", ") : err.message;
    throw new ApiError(res.status, message || `Error ${res.status}`, err.errors);
  }

  return body as T;
}

/** Convenience helpers for the common verbs. */
export const http = {
  get: <T = any>(endpoint: string) => request<T>(endpoint),
  post: <T = any>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: "POST", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
  put: <T = any>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: "PUT", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
  delete: <T = any>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};
