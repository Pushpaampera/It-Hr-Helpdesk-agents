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

type Options = { onStart?: () => void; onEnd?: () => void };

export function useSpeechOutput({ onStart, onEnd }: Options = {}) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [enabled, setEnabledState] = useState(readPref);
  const [speaking, setSpeaking] = useState(false);
  const cbRef = useRef({ onStart, onEnd });
  cbRef.current = { onStart, onEnd };

  const cancel = useCallback(() => {
    if (!supported) return;
    const wasSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
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
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = navigator.language || "en-US";
      u.onstart = () => {
        setSpeaking(true);
        cbRef.current.onStart?.();
      };
      const finish = () => {
        setSpeaking(false);
        cbRef.current.onEnd?.();
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
    },
    [supported, enabled],
  );

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, enabled, setEnabled, speaking, speak, cancel };
}
