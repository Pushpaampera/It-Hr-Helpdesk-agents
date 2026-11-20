/** The logged-in user and JWT, shared across every page.
 *
 * Each browser tab keeps its OWN session (sessionStorage), so you can be the employee in one tab
 * and HR or IT support in another, and a refresh keeps each tab in its own role. (It used to be
 * one localStorage entry for all tabs: the last login overwrote the others, so refreshing the
 * employee tab came back as HR.) A brand-new tab has no session yet, so it starts from the most
 * recent login (kept in localStorage) instead of asking you to sign in again. */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import apiFetch from "../api/client";
import type { LoginResponse, User } from "../api/types";

const LAST_LOGIN_KEY = "helpdesk.auth.last";

const perTabStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.sessionStorage.getItem(name) ?? window.localStorage.getItem(LAST_LOGIN_KEY);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.sessionStorage.setItem(name, value);
      // Only a real login becomes the starting session for new tabs; a logout in one tab must
      // not sign out the others.
      if (JSON.parse(value)?.state?.token) window.localStorage.setItem(LAST_LOGIN_KEY, value);
    } catch {
      // storage unavailable (private mode etc.): the session just won't survive a refresh
    }
  },
  removeItem: (name) => {
    try {
      window.sessionStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  /** Chooses a new password (required after signing in with a temporary one); the server
   * returns a normal session, which replaces the limited one. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
        const userId = get().user?.id;
        set({ token: null, user: null, isAuthenticated: false, error: null });
        // Don't let a new tab start as the person who just signed out.
        try {
          const last = window.localStorage.getItem(LAST_LOGIN_KEY);
          if (last && JSON.parse(last)?.state?.user?.id === userId) window.localStorage.removeItem(LAST_LOGIN_KEY);
        } catch {
          // ignore
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        const res = await apiFetch<LoginResponse>("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });
        set({ token: res.access_token, user: res.user, isAuthenticated: true, error: null });
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
      storage: createJSONStorage(() => perTabStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = Boolean(state.token);
      },
    },
  ),
);
