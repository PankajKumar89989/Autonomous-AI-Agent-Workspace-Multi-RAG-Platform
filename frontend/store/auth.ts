import { create } from "zustand";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "USER" | "ADMIN";
  created_at: string;
};

type Status = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  status: Status;
  setSession: (user: User, accessToken: string) => void;
  clear: () => void;
};

// The access token lives in memory only; the refresh token is an httpOnly cookie.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: (user, accessToken) => set({ user, accessToken, status: "authenticated" }),
  clear: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
}));
