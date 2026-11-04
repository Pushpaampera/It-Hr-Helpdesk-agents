/** Animates a number counting up to `target` on mount/when `target` changes, for KPI/stat
 * cards. Respects the global reduce-motion flag — jumps straight to the final value instead of
 * animating when the user (or their OS) has asked for reduced motion. */
import { useEffect, useRef, useState } from "react";

import { useUIStore } from "../store/uiStore";

export function useCountUp(target: number, durationMs = 900): number {
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<{ from: number; at: number } | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      setValue(target);
      return;
    }

    startRef.current = { from: value, at: performance.now() };

    function tick(now: number) {
      const start = startRef.current;
      if (!start) return;
      const elapsed = now - start.at;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out cubic, matching the feel of this app's other motion curves.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start.from + (target - start.from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduceMotion]);

  return value;
}
