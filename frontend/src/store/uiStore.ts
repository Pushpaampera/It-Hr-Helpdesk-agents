/** Global UI preferences shared across every page.
 *
 * These are the settings behind the Accessibility panel (src/components/AccessibilityPanel.tsx):
 * text size, high contrast, easy-to-read font, extra spacing and "stop animations". They are
 * saved in this browser and applied as data-attributes on <html>, which src/design/tokens.css
 * turns into the actual look — so every page picks them up with no per-page code.
 *
 * `reduceMotion` keeps its original name: framer-motion helpers (src/design/motion.ts, Reveal,
 * the page transitions) read it, and it starts from the operating system's "reduce motion"
 * setting when the person has never chosen one. */
import { create } from "zustand";

const STORAGE_KEY = "ampera.accessibility";
const LEGACY_REDUCE_MOTION_KEY = "helpdesk.reduceMotion";

export type TextSize = "normal" | "large" | "xlarge";

type Preferences = {
  textSize: TextSize;
  highContrast: boolean;
  readableFont: boolean;
  extraSpacing: boolean;
  reduceMotion: boolean;
};

function systemPrefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function defaults(): Preferences {
  return {
    textSize: "normal",
    highContrast: false,
    readableFont: false,
    extraSpacing: false,
    reduceMotion: systemPrefersReducedMotion(),
  };
}

function readStoredPreferences(): Preferences {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return {
        textSize: parsed.textSize === "large" || parsed.textSize === "xlarge" ? parsed.textSize : "normal",
        highContrast: parsed.highContrast === true,
        readableFont: parsed.readableFont === true,
        extraSpacing: parsed.extraSpacing === true,
        reduceMotion: typeof parsed.reduceMotion === "boolean" ? parsed.reduceMotion : base.reduceMotion,
      };
    }
    // Carry over the old standalone "Reduce motion" choice, if there was one.
    const legacy = window.localStorage.getItem(LEGACY_REDUCE_MOTION_KEY);
    if (legacy !== null) return { ...base, reduceMotion: legacy === "true" };
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall back to defaults.
  }
  return base;
}

function applyToDocument(p: Preferences) {
  const root = document.documentElement;
  root.dataset.textSize = p.textSize;
  root.dataset.contrast = p.highContrast ? "high" : "normal";
  root.dataset.readableFont = String(p.readableFont);
  root.dataset.spacing = String(p.extraSpacing);
  root.dataset.reduceMotion = String(p.reduceMotion);
}

function persist(p: Preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Best-effort persistence only.
  }
}

type UIState = Preferences & {
  tabVisible: boolean;
  setTextSize: (value: TextSize) => void;
  setHighContrast: (value: boolean) => void;
  setReadableFont: (value: boolean) => void;
  setExtraSpacing: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  toggleReduceMotion: () => void;
  resetPreferences: () => void;
  setTabVisible: (visible: boolean) => void;
};

const initial: Preferences = typeof window !== "undefined" ? readStoredPreferences() : {
  textSize: "normal", highContrast: false, readableFont: false, extraSpacing: false, reduceMotion: false,
};
if (typeof document !== "undefined") applyToDocument(initial);

function pick(s: Preferences): Preferences {
  return {
    textSize: s.textSize,
    highContrast: s.highContrast,
    readableFont: s.readableFont,
    extraSpacing: s.extraSpacing,
    reduceMotion: s.reduceMotion,
  };
}

export const useUIStore = create<UIState>((set, get) => {
  function update(patch: Partial<Preferences>) {
    const next = { ...pick(get()), ...patch };
    applyToDocument(next);
    persist(next);
    set(next);
  }

  return {
    ...initial,
    tabVisible: typeof document !== "undefined" ? !document.hidden : true,
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

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    useUIStore.getState().setTabVisible(!document.hidden);
  });
}
