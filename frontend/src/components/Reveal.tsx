/** Scroll-triggered fade-up reveal for landing-page sections, built on the shared `fadeUp`
 * variant from src/design/motion.ts. Skips the animation entirely under reduced motion rather
 * than just shortening it, since a single mount frame makes more sense than a near-instant
 * transition for a scroll-position-dependent effect. */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { fadeUp } from "../design/motion";
import { useUIStore } from "../store/uiStore";

type RevealProps = { children: ReactNode; className?: string };

export default function Reveal({ children, className }: RevealProps) {
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
    >
      {children}
    </motion.div>
  );
}
