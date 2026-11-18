/** Typed wrapper around the `.glass-panel` utility class from src/design/global.css (the app's
 * standard white card), so pages get the panel treatment without hand-concatenating class
 * names. Forwards its ref so a panel can also serve as a dialog container. */
import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel({ children, className, ...props }, ref) {
  return (
    <div ref={ref} className={["glass-panel", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
});

export default Panel;
