/** The persistent dashboard shell (sidebar nav + top bar + content outlet) every `/app/*` page
 * renders inside, from Phase 8 onward. */
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import ReduceMotionToggle from "../components/ReduceMotionToggle";
import { useAuthStore } from "../store/authStore";
import styles from "./DashboardLayout.module.css";
import { NAV_ITEMS } from "./navItems";

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className={styles.shell}>
      <div className={`${styles.backdrop} ${sidebarOpen ? styles.backdropOpen : ""}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
          <Link to="/app/overview" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16 }}>
            Helpdesk AI Agents
          </Link>
          <button className={styles.closeButton} onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
          {items.map((item) => {
            const Icon = item.icon;
            if (!item.implemented) {
              return (
                <div key={item.label} className={styles.navItemDisabled}>
                  <Icon size={17} />
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
                <Icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.userCard}>
          <div className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{user.role}</div>
          </div>
          <button onClick={handleLogout} aria-label="Sign out" className={styles.iconButton}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <button className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div style={{ flex: 1 }} />
          <ReduceMotionToggle />
        </div>
        <Outlet />
      </div>
    </div>
  );
}
