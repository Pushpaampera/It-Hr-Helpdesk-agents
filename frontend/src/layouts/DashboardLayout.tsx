/** The persistent dashboard shell (sidebar nav + top bar + content outlet) every `/app/*` page
 * renders inside.
 *
 * Accessibility: a "skip to main content" link, labelled landmarks (navigation, main), the
 * current page marked with aria-current, and — on every page change — the browser tab title is
 * updated and keyboard focus moves to the new page's content, so screen-reader users hear where
 * they landed instead of being left on the old link. */
import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import AccessibilityPanel from "../components/AccessibilityPanel";
import NotificationBell from "../components/NotificationBell";
import SkipLink from "../components/SkipLink";
import Logo from "../components/ui/Logo";
import { useAuthStore } from "../store/authStore";
import styles from "./DashboardLayout.module.css";
import { NAV_ITEMS } from "./navItems";

const ROLE_LABELS: Record<string, string> = { employee: "Employee", it_support: "IT Support", hr: "HR", admin: "Admin" };

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const items = user ? NAV_ITEMS.filter((item) => item.roles.includes(user.role)) : [];
  const currentItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));

  // On every page change: update the tab title and move focus to the new content.
  useEffect(() => {
    document.title = `${currentItem?.label ?? "Dashboard"} · Ampera HelpDesk`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname, currentItem?.label]);

  // Esc closes the mobile menu.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className={styles.shell}>
      <SkipLink />
      <div className={`${styles.backdrop} ${sidebarOpen ? styles.backdropOpen : ""}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="Sidebar">
        <div className={styles.sidebarTop}>
          <Logo to="/app/overview" size={26} onNavy />
          <button className={styles.closeButton} onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main" className={styles.nav}>
          {items.map((item) => {
            const Icon = item.icon;
            if (!item.implemented) {
              return (
                <div key={item.label} className={styles.navItemDisabled} aria-disabled="true">
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className={styles.soonBadge}>Soon</span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.label}
                to={item.path}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.userCard}>
          <div className={styles.avatar} aria-hidden="true">{user.name.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.userName}>{user.name}</div>
            <div className={styles.userRole}>{ROLE_LABELS[user.role] ?? user.role}</div>
          </div>
          <button onClick={handleLogout} aria-label="Sign out" title="Sign out" className={styles.iconButton}>
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={styles.menuButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <div style={{ flex: 1 }} />
          <NotificationBell />
          <AccessibilityPanel />
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
