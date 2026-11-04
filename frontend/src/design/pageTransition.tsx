/** Wraps a page's content in a consistent enter/exit fade, so navigating between dashboard
 * pages reads as a deliberate transition instead of an instant swap. Uses the shared `fadeUp`
 * variant so the motion language matches the rest of the app. */
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { fadeUp } from "./motion";

type PageTransitionProps = {
  children: ReactNode;
  /** A key that changes when the "page" changes, so AnimatePresence knows to re-run the
   * transition even if the route itself doesn't remount (e.g. a tab switch within one page).
   * Defaults to a constant key, which still animates the initial mount. */
  routeKey?: string;
};

export default function PageTransition({ children, routeKey = "page" }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={routeKey} initial="hidden" animate="visible" exit="hidden" variants={fadeUp}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
