/** Global UI preferences shared across every page.
 *
 * These are the settings behind the Accessibility panel (src/components/AccessibilityPanel.tsx):
 * appearance (light / dark / match my device), text size, high contrast, easy-to-read font, extra
 * spacing and "stop animations". They are applied as data-attributes on <html>, which
 * src/design/tokens.css turns into the actual look — so every page picks them up with no
 * per-page code.
 *
 * Saving: choices are saved in this browser *per signed-in person* — when someone signs in, their
 * own saved settings are applied (a person signing in for the first time keeps whatever they were
 * already using); when they sign out the browser's general settings come back. Signed-out pages
 * (landing, sign-in) use the browser's general settings.
 *
 * `reduceMotion` keeps its original name: framer-motion helpers (src/design/motion.ts, Reveal,
 * the page transitions) read it, and it starts from the operating system's "reduce motion"
 * setting when the person has never chosen one. */
import { create } from "zustand";

import { useAuthStore } from "./authStore";

const STORAGE_KEY = "ampera.accessibility";
const LEGACY_REDUCE_MOTION_KEY = "helpdesk.reduceMotion";

export type TextSize = "normal" | "large" | "xlarge";
/** "system" follows the device's own light/dark setting and updates live when it changes. */
export type ThemeChoice = "light" | "dark" | "system";

type Preferences = {
  theme: ThemeChoice;
  textSize: TextSize;
  highContrast: boolean;
  readableFont: boolean;
  extraSpacing: boolean;
  reduceMotion: boolean;
};

function systemPrefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function defaults(): Preferences {
  return {
    // Light stays the default so nobody is surprised; "Match my device" is one tap away.
    theme: "light",
    textSize: "normal",
    highContrast: false,
    readableFont: false,
    extraSpacing: false,
    reduceMotion: systemPrefersReducedMotion(),
  };
}

function keyFor(userId: string | null): string {
  return userId ? `${STORAGE_KEY}.user.${userId}` : STORAGE_KEY;
}

/** Saved preferences for this key, or null if nothing valid is stored. */
function readSaved(key: string): Preferences | null {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return {
        theme: parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : "light",
        textSize: parsed.textSize === "large" || parsed.textSize === "xlarge" ? parsed.textSize : "normal",
        highContrast: parsed.highContrast === true,
        readableFont: parsed.readableFont === true,
        extraSpacing: parsed.extraSpacing === true,
        reduceMotion: typeof parsed.reduceMotion === "boolean" ? parsed.reduceMotion : base.reduceMotion,
      };
    }
    // Carry over the old standalone "Reduce motion" choice, if there was one (browser-wide only).
    if (key === STORAGE_KEY) {
      const legacy = window.localStorage.getItem(LEGACY_REDUCE_MOTION_KEY);
      if (legacy !== null) return { ...base, reduceMotion: legacy === "true" };
    }
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall back to defaults.
  }
  return null;
}

function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

function applyToDocument(p: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(p.theme);
  root.dataset.textSize = p.textSize;
  root.dataset.contrast = p.highContrast ? "high" : "normal";
  root.dataset.readableFont = String(p.readableFont);
  root.dataset.spacing = String(p.extraSpacing);
  root.dataset.reduceMotion = String(p.reduceMotion);
}

function persist(key: string, p: Preferences) {
  try {
    window.localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // Best-effort persistence only.
  }
}

function pick(s: Preferences): Preferences {
  return {
    theme: s.theme,
    textSize: s.textSize,
    highContrast: s.highContrast,
    readableFont: s.readableFont,
    extraSpacing: s.extraSpacing,
    reduceMotion: s.reduceMotion,
  };
}

type UIState = Preferences & {
  tabVisible: boolean;
  setTheme: (value: ThemeChoice) => void;
  setTextSize: (value: TextSize) => void;
  setHighContrast: (value: boolean) => void;
  setReadableFont: (value: boolean) => void;
  setExtraSpacing: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  toggleReduceMotion: () => void;
  resetPreferences: () => void;
  setTabVisible: (visible: boolean) => void;
};

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

/** Whose settings are active right now: the signed-in person's id, or null when signed out. */
let activeUserId: string | null = isBrowser ? (useAuthStore.getState().user?.id ?? null) : null;

const initial: Preferences = isBrowser
  ? readSaved(keyFor(activeUserId)) ?? readSaved(keyFor(null)) ?? defaults()
  : { theme: "light", textSize: "normal", highContrast: false, readableFont: false, extraSpacing: false, reduceMotion: false };
if (isBrowser) applyToDocument(initial);

export const useUIStore = create<UIState>((set, get) => {
  function update(patch: Partial<Preferences>) {
    const next = { ...pick(get()), ...patch };
    applyToDocument(next);
    persist(keyFor(activeUserId), next);
    set(next);
  }

  return {
    ...initial,
    tabVisible: isBrowser ? !document.hidden : true,
    setTheme: (theme) => update({ theme }),
    setTextSize: (textSize) => update({ textSize }),
    setHighContrast: (highContrast) => update({ highContrast }),
    setReadableFont: (readableFont) => update({ readableFont }),
    setExtraSpacing: (extraSpacing) => update({ extraSpacing }),
    setReduceMotion: (reduceMotion) => update({ reduceMotion }),
    toggleReduceMotion: () => update({ reduceMotion: !get().reduceMotion }),
    resetPreferences: () => update({ ...defaults(), reduceMotion: systemPrefersReducedMotion() }),
    setTabVisible: (visible) => set({ tabVisible: visible }),
  };
});

if (isBrowser) {
  document.addEventListener("visibilitychange", () => {
    useUIStore.getState().setTabVisible(!document.hidden);
  });

  // "Match my device": follow the system light/dark setting live while that choice is active.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    const s = useUIStore.getState();
    if (s.theme === "system") applyToDocument(pick(s));
  });

  // Sign-in / sign-out: switch to that person's saved settings (or back to the browser's own).
  useAuthStore.subscribe((state) => {
    const nextUserId = state.user?.id ?? null;
    if (nextUserId === activeUserId) return;
    const previous = pick(useUIStore.getState());
    activeUserId = nextUserId;
    // Signing in for the first time keeps what the person was already using, and saves it as theirs;
    // signing out returns to the browser's general settings.
    const next = readSaved(keyFor(nextUserId)) ?? (nextUserId ? previous : (readSaved(keyFor(null)) ?? defaults()));
    applyToDocument(next);
    if (nextUserId) persist(keyFor(nextUserId), next);
    useUIStore.setState(next);
  });
}
