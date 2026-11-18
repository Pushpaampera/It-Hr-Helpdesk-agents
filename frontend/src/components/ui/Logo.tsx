/** The "Ampera HelpDesk" logo: a small mark (three nodes around a core — the helpers working
 * together) in Ampera's purples, the "Ampera" wordmark in Montserrat, and a "HelpDesk" pill.
 * Pure SVG/CSS, no image file. */
import { Link } from "react-router-dom";

import styles from "./Logo.module.css";

type LogoProps = {
  size?: number;
  to?: string | null;
  showPill?: boolean;
};

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="6.5" fill="#5e5490" />
      <circle cx="16" cy="4.5" r="3.2" fill="#7c70af" />
      <circle cx="27" cy="22.5" r="3.2" fill="#7c70af" />
      <circle cx="5" cy="22.5" r="3.2" fill="#7c70af" />
      <path d="M16 8V13.5" stroke="#493f7b" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21.5 19.5L18.3 16.6" stroke="#493f7b" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.5 19.5L13.7 16.6" stroke="#493f7b" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 28, to = "/", showPill = true }: LogoProps) {
  const content = (
    <>
      <LogoMark size={size} />
      <span className={styles.wordmark} style={{ fontSize: `${(size * 0.72) / 16}rem` }}>
        Ampera
      </span>
      {showPill && (
        <span className={styles.pill} style={{ fontSize: `${Math.max(size * 0.42, 12) / 16}rem`, padding: `${size * 0.1}px ${size * 0.26}px` }}>
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
