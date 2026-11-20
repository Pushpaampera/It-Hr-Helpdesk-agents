/** Route guard: redirects to /login (remembering where the visitor was headed) when there's no
 * authenticated session. Wraps every `/app/*` route from Phase 7 onward.
 * IT support only works IT tickets: any page outside their sidebar (typed URL, old bookmark)
 * sends them back to the Overview. The backend refuses those APIs as well.
 * Someone signed in with a temporary password is sent to /change-password first. */
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { NAV_ITEMS } from "../layouts/navItems";
import { useAuthStore } from "../store/authStore";

export default function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const mustChangePassword = useAuthStore((s) => s.user?.must_change_password);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // Signed in with a temporary password: choose a new one before anything else (the backend
  // refuses every other API for this session too).
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  if (role === "it_support") {
    const page = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
    if (page && !page.roles.includes(role)) return <Navigate to="/app/overview" replace />;
  }

  return <Outlet />;
}
