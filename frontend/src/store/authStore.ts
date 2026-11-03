/** The logged-in user and JWT, shared across every page. Persisted to localStorage so a page
 * refresh doesn't drop the session; Phase 7 (Login page) is the first page that calls `login`,
 * but the store is built now so later phases have somewhere to read `user`/`token` from. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import apiFetch from "../api/client";
import type { LoginResponse, User } from "../api/types";

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiFetch<LoginResponse>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
          set({ token: res.access_token, user: res.user, isAuthenticated: true, isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: err instanceof Error ? err.message : "Login failed" });
          throw err;
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false, error: null });
      },

      refreshMe: async () => {
        if (!get().token) return;
        try {
          const user = await apiFetch<User>("/auth/me");
          set({ user, isAuthenticated: true });
        } catch {
          get().logout();
        }
      },
    }),
    {
      name: "helpdesk.auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = Boolean(state.token);
      },
    },
  ),
);
