import { useAuthStore, type User } from "@/store/auth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export type AuthPayload = { user: User; access_token: string };

export async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json"); // FormData sets its own boundary
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Cannot reach the server. Is the backend running?", 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Request failed.", res.status);
  }
  return json.data as T;
}

// Refresh tokens rotate, so concurrent refreshes must share one request.
let refreshInFlight: Promise<AuthPayload> | null = null;

export function refreshSession(): Promise<AuthPayload> {
  if (!refreshInFlight) {
    refreshInFlight = request<AuthPayload>("/auth/refresh", { method: "POST" })
      .then((payload) => {
        useAuthStore.getState().setSession(payload.user, payload.access_token);
        return payload;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Authenticated request: retries once after a silent token refresh on 401. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init, useAuthStore.getState().accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      await refreshSession();
    } catch {
      useAuthStore.getState().clear();
      throw error;
    }
    return request<T>(path, init, useAuthStore.getState().accessToken);
  }
}
