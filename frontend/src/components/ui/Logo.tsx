/** The "Ampera HelpDesk" logo: Ampera's official logo (the same artwork as on amperadei.com,
 * src/assets/ampera-logo.png) followed by a "HelpDesk" pill. `onNavy` styles the pill for the navy
 * sidebar (white text on the lighter navy); otherwise it is magenta on the soft magenta tint. */
import { Link } from "react-router-dom";

import amperaLogo from "../../assets/ampera-logo.png";
import styles from "./Logo.module.css";

type LogoProps = {
  size?: number;
  to?: string | null;
  showPill?: boolean;
  onNavy?: boolean;
};

export default function Logo({ size = 28, to = "/", showPill = true, onNavy = false }: LogoProps) {
  const height = Math.round(size * 1.15);
  const content = (
    <>
      <img src={amperaLogo} alt="Ampera" height={height} width={Math.round(height * (810 / 226))} style={{ display: "block", height, width: "auto" }} />
      {showPill && (
        <span className={`${styles.pill} ${onNavy ? styles.pillOnNavy : ""}`} style={{ fontSize: `${Math.max(size * 0.42, 12) / 16}rem`, padding: `${size * 0.1}px ${size * 0.26}px` }}>
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
