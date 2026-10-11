import { request, refreshSession, type AuthPayload } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function store() {
  return useAuthStore.getState();
}

export async function login(email: string, password: string): Promise<void> {
  const payload = await request<AuthPayload>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  store().setSession(payload.user, payload.access_token);
}

export async function register(full_name: string, email: string, password: string): Promise<void> {
  const payload = await request<AuthPayload>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ full_name, email, password }),
  });
  store().setSession(payload.user, payload.access_token);
}

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    store().clear();
  }
}

export async function restoreSession(): Promise<void> {
  try {
    await refreshSession();
  } catch {
    store().clear();
  }
}
