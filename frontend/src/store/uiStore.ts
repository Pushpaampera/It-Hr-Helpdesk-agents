/** Global UI preferences shared across every page.
 *
 * These are the settings behind the Accessibility panel (src/components/AccessibilityPanel.tsx):
 * appearance (light / dark / match my device), text size, high contrast, easy-to-read font, extra
 * spacing and "stop animations". They are applied as data-attributes on <html>, which
 * src/design/tokens.css turns into the actual look — so every page picks them up with no
 * per-page code.
 *
 * Saving: ONE setting for the whole browser. Whatever is chosen — on the landing page, the sign-in
 * page or inside the portal — applies to every page, stays the same when signing in or out, and
 * updates other open tabs immediately. (Accessibility needs must not reset or differ by page.)
 *
 * `reduceMotion` keeps its original name: framer-motion helpers (src/design/motion.ts, Reveal,
 * the page transitions) read it, and it starts from the operating system's "reduce motion"
 * setting when the person has never chosen one. */
import { create } from "zustand";

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

/** Settings saved by older versions per signed-in person (`ampera.accessibility.user.<id>`).
 * Used once, as a fallback, so nobody loses their choice when moving to the browser-wide setting. */
function readLegacyPerUser(): Preferences | null {
  try {
    const raw = window.localStorage.getItem("helpdesk.auth");
    const userId = raw ? (JSON.parse(raw)?.state?.user?.id as string | undefined) : undefined;
    return userId ? readSaved(`${STORAGE_KEY}.user.${userId}`) : null;
  } catch {
    return null;
  }
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

const initial: Preferences = isBrowser
  ? readSaved(STORAGE_KEY) ?? readLegacyPerUser() ?? defaults()
  : { theme: "light", textSize: "normal", highContrast: false, readableFont: false, extraSpacing: false, reduceMotion: false };
if (isBrowser) applyToDocument(initial);

export const useUIStore = create<UIState>((set, get) => {
  function update(patch: Partial<Preferences>) {
    const next = { ...pick(get()), ...patch };
    applyToDocument(next);
    persist(STORAGE_KEY, next);
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

  // Another open tab changed a setting: apply it here too, straight away.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readSaved(STORAGE_KEY) ?? defaults();
    applyToDocument(next);
    useUIStore.setState(next);
  });
}
