/** Typed wrapper around the `.glass-panel` utility class from src/design/global.css, so pages
 * get the panel treatment without hand-concatenating class names. */
import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export default function Panel({ children, className, ...props }: PanelProps) {
  return (
    <div className={["glass-panel", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}
