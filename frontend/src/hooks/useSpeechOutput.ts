/** Reads assistant answers aloud with the browser's built-in speechSynthesis (works in Chrome,
 * Edge, Safari and Firefox; no backend). The on/off choice is remembered per browser. Markdown is
 * stripped first so the voice doesn't read out "asterisk asterisk" or link URLs. */
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "helpdesk.readAloud";

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Turn a markdown answer into plain sentences that sound right when spoken. */
export function markdownToSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> their text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/[*_~>|]/g, "") // emphasis, quotes, table pipes
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- One consistent voice everywhere ----------
 * Left to itself the browser uses its default voice, which on Linux is usually a robotic male
 * system voice. We always pick the same clear female voice instead, the first one available
 * from this list, so every page and every role sounds identical in a given browser. */
const PREFERRED_VOICES = [
  "Google US English", // Chrome (female)
  "Google UK English Female", // Chrome
  "Microsoft Aria Online (Natural) - English (United States)", // Edge
  "Microsoft Jenny Online (Natural) - English (United States)", // Edge
  "Microsoft Ava Online (Natural) - English (United States)", // Edge
  "Microsoft Zira - English (United States)", // Windows
  "Microsoft Zira Desktop - English (United States)", // Windows
  "Samantha", // macOS / iOS
  "Karen", // macOS
  "Serena", // macOS
  "Victoria", // macOS
];
// Matches "Female", "+female2" (eSpeak on Linux) and common female voice names.
const FEMALE_HINT =
  /female|\b(woman|aria|jenny|ava|zira|samantha|karen|serena|victoria|susan|hazel|libby|sonia|natasha|emma|olivia)\b/i;
// "male" not preceded by "fe" ("+male1", "UK English Male") and common male voice names.
const MALE_HINT = /(?<!fe)male|\b(man|david|mark|guy|ryan|daniel|george|alex|fred)\b/i;

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // not loaded yet; try again on the next utterance
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  cachedVoice =
    PREFERRED_VOICES.map((name) => voices.find((v) => v.name === name)).find(
      Boolean,
    ) ??
    english.find((v) => FEMALE_HINT.test(v.name)) ??
    english.find((v) => !MALE_HINT.test(v.name)) ??
    english[0] ??
    null;
  return cachedVoice;
}

/** Split into sentence-sized pieces. Chrome's Google voices stop speaking after ~15 seconds
 * of a single utterance, so long answers are queued as several short ones. */
function chunk(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if ((cur + " " + s).trim().length > max && cur) {
      out.push(cur);
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

type Options = { onStart?: () => void; onEnd?: () => void };
export function useSpeechOutput({ onStart, onEnd }: Options = {}) {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [enabled, setEnabledState] = useState(readPref);
  const [speaking, setSpeaking] = useState(false);
  const cbRef = useRef({ onStart, onEnd });
  cbRef.current = { onStart, onEnd };
  // Bumped on every new speak()/cancel() so callbacks from an interrupted answer are ignored.
  const generation = useRef(0);

  const cancel = useCallback(() => {
    if (!supported) return;
    const wasSpeaking =
      window.speechSynthesis.speaking || window.speechSynthesis.pending;
    generation.current++;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    if (wasSpeaking) cbRef.current.onEnd?.();
  }, [supported]);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      try {
        localStorage.setItem(STORAGE_KEY, String(on));
      } catch {
        // Best-effort only.
      }
      if (!on) cancel();
    },
    [cancel],
  );

  const speak = useCallback(
    (markdown: string) => {
      if (!supported || !enabled) return;
      const text = markdownToSpeech(markdown);
      if (!text) return;
      const gen = ++generation.current;
      try {
        window.speechSynthesis.cancel();
        const voice = pickVoice();
        const parts = chunk(text);
        parts.forEach((part, i) => {
          const u = new SpeechSynthesisUtterance(part);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          } else {
            u.lang = "en-US";
          }
          u.rate = 1;
          u.pitch = 1.05;
          if (i === 0) {
            u.onstart = () => {
              if (gen !== generation.current) return;
              setSpeaking(true);
              cbRef.current.onStart?.();
            };
          }
          const finish = () => {
            if (gen !== generation.current) return;
            setSpeaking(false);
            cbRef.current.onEnd?.();
          };
          if (i === parts.length - 1) u.onend = finish;
          u.onerror = (e) => {
            // "interrupted"/"canceled" just mean a newer answer or cancel() took over.
            if (e.error !== "interrupted" && e.error !== "canceled") finish();
          };
          window.speechSynthesis.speak(u);
        });
      } catch {
        // Read-aloud is a nice-to-have: a browser speech failure must never break the chat.
        setSpeaking(false);
      }
    },
    [supported, enabled],
  );

  // Voices load asynchronously in Chrome; re-pick once the full list is available.
  useEffect(() => {
    if (!supported) return;
    const reset = () => {
      cachedVoice = undefined;
    };
    window.speechSynthesis.addEventListener("voiceschanged", reset);
    window.speechSynthesis.getVoices(); // kicks off loading
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", reset);
  }, [supported]);

  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  return { supported, enabled, setEnabled, speaking, speak, cancel };
}
