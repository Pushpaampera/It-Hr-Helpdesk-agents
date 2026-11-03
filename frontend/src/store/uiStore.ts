/** Global UI preferences shared across every page: the "Reduce motion" toggle (hard constraint
 * from CLAUDE.md — every 3D scene must respect it) and whether the tab is currently visible, so
 * 3D scenes can pause rendering when backgrounded. */
import { create } from "zustand";

const STORAGE_KEY = "helpdesk.reduceMotion";

function readStoredPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall through to the media query.
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function applyToDocument(reduceMotion: boolean) {
  document.documentElement.dataset.reduceMotion = String(reduceMotion);
}

type UIState = {
  reduceMotion: boolean;
  tabVisible: boolean;
  setReduceMotion: (value: boolean) => void;
  toggleReduceMotion: () => void;
  setTabVisible: (visible: boolean) => void;
};

const initialReduceMotion = typeof window !== "undefined" ? readStoredPreference() : false;
if (typeof document !== "undefined") applyToDocument(initialReduceMotion);

export const useUIStore = create<UIState>((set, get) => ({
  reduceMotion: initialReduceMotion,
  tabVisible: typeof document !== "undefined" ? !document.hidden : true,
  setReduceMotion: (value) => {
    applyToDocument(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Best-effort persistence only.
    }
    set({ reduceMotion: value });
  },
  toggleReduceMotion: () => get().setReduceMotion(!get().reduceMotion),
  setTabVisible: (visible) => set({ tabVisible: visible }),
}));

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    useUIStore.getState().setTabVisible(!document.hidden);
  });
}
