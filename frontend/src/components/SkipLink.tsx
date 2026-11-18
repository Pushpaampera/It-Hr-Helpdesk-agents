/** "Skip to main content" — hidden until it receives keyboard focus, so people using a keyboard
 * or screen reader can jump past the navigation on every page. The target is the <main
 * id="main-content"> each page layout renders. */
export default function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>
  );
}
