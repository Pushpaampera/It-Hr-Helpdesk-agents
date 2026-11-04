/** Replaces the old underlined "Ampera Helpdesk" text link: a small SVG mark (three nodes
 * orbiting a core — the "agent network" the whole product is about) plus the "Ampera" wordmark
 * in the brand heading font, with a "HelpDesk" pill beside it. Pure SVG/CSS, no image file, so
 * it also doubles as the favicon source (see index.html). */
import { Link } from "react-router-dom";

import styles from "./Logo.module.css";

type LogoProps = {
  size?: number;
  to?: string | null;
  showPill?: boolean;
};

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logoGrad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="6.5" fill="url(#logoGrad)" />
      <circle cx="16" cy="4.5" r="3.2" fill="#f472b6" />
      <circle cx="27" cy="22.5" r="3.2" fill="#fb923c" />
      <circle cx="5" cy="22.5" r="3.2" fill="#2dd4bf" />
      <path d="M16 8V13.5" stroke="#c4b5fd" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21.5 19.5L18.3 16.6" stroke="#c4b5fd" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.5 19.5L13.7 16.6" stroke="#c4b5fd" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 28, to = "/", showPill = true }: LogoProps) {
  const content = (
    <>
      <LogoMark size={size} />
      <span className={styles.wordmark} style={{ fontSize: size * 0.72 }}>
        Ampera
      </span>
      {showPill && (
        <span className={styles.pill} style={{ fontSize: size * 0.36, padding: `${size * 0.1}px ${size * 0.26}px` }}>
          HelpDesk
        </span>
      )}
    </>
  );

  if (!to) {
    return <span className={styles.logo}>{content}</span>;
  }
  return (
    <Link to={to} className={styles.logo}>
      {content}
    </Link>
  );
}
