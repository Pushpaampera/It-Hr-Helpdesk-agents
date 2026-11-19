/** Voice input for the chat box, using the browser's built-in Web Speech API (no backend, no
 * third-party service). What the person says is written into the message box live, words still
 * being recognised included, but it is NEVER sent automatically: the person reviews or edits it
 * and presses Enter (or Send) themselves.
 *
 * Listening stays on across pauses until the message is sent (the caller calls stop()) or
 * SILENCE_TIMEOUT_MS passes without speech.
 * Chrome ends a "continuous" session on its own every so often, so while the person still wants
 * the mic on we quietly start it again.
 *
 * Support: Chrome, Edge and Safari. Firefox has no working SpeechRecognition, so `supported` is
 * false there and the caller shows the mic button disabled with an explanation. */
import { useCallback, useEffect, useRef, useState } from "react";

export const SILENCE_TIMEOUT_MS = 15_000;

// Minimal typings: SpeechRecognition isn't in TypeScript's DOM lib.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function join(...parts: string[]) {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

type Options = {
  /** Called with the full text the message box should now show. */
  onText: (text: string) => void;
};

export function useVoiceInput({ onText }: Options) {
  const supported = getRecognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when listening ended because nobody spoke for SILENCE_TIMEOUT_MS. */
  const [timedOut, setTimedOut] = useState(false);

  const recRef = useRef<Recognition | null>(null);
  const wantOnRef = useRef(false); // the person wants the mic on
  const baseRef = useRef(""); // text that was in the box before this stretch of speech
  const finalRef = useRef(""); // finished phrases recognised since `baseRef` was set
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const clearSilenceTimer = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  };

  const stop = useCallback(() => {
    wantOnRef.current = false;
    clearSilenceTimer();
    recRef.current?.abort(); // abort, not stop: drop any half-recognised words immediately
    setListening(false);
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => {
      setTimedOut(true);
      stop();
    }, SILENCE_TIMEOUT_MS);
  }, [stop]);

  const launch = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    rec.onresult = (e) => {
      // Chrome can deliver a last result just after stop(); once the mic is off (e.g. the message
      // was just sent), ignore it so it can't refill the cleared box.
      if (!wantOnRef.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = join(finalRef.current, r[0].transcript);
        else interim = join(interim, r[0].transcript);
      }
      onTextRef.current(join(baseRef.current, finalRef.current, interim));
      armSilenceTimer(); // any speech resets the 15s countdown
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // handled by the silence timer / onend
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access was blocked. Allow the microphone for this site in your browser settings.",
        "service-not-allowed": "Microphone access was blocked. Allow the microphone for this site in your browser settings.",
        "audio-capture": "No microphone was found.",
        network: "Voice typing needs an internet connection in this browser.",
      };
      setError(messages[e.error] ?? `Voice input stopped (${e.error}).`);
      stop();
    };

    rec.onend = () => {
      // Chrome ends continuous sessions on its own; restart while the person still wants it on.
      if (wantOnRef.current) {
        // Keep what was said so far: it becomes the base for the next session.
        baseRef.current = join(baseRef.current, finalRef.current);
        finalRef.current = "";
        try {
          rec.start();
        } catch {
          stop();
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // start() throws if a previous session hasn't fully closed yet; ignore, onend will retry.
    }
  }, [armSilenceTimer, stop]);

  /** Turn the mic on. `currentText` is what's already in the message box; speech is appended to it. */
  const start = useCallback(
    (currentText: string) => {
      if (!supported) return;
      setError(null);
      setTimedOut(false);
      baseRef.current = currentText;
      finalRef.current = "";
      wantOnRef.current = true;
        setListening(true);
      armSilenceTimer();
      launch();
    },
    [supported, armSilenceTimer, launch],
  );

  /** The box changed by other means (typing, or cleared after sending): speech continues from this text. */
  const syncText = useCallback((text: string) => {
    baseRef.current = text;
    finalRef.current = "";
  }, []);

  useEffect(
    () => () => {
      wantOnRef.current = false;
      clearSilenceTimer();
      recRef.current?.abort();
    },
    [],
  );

  return { supported, listening, error, timedOut, start, stop, syncText };
}
