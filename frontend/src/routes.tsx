import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import DashboardLayout from "./layouts/DashboardLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Overview from "./pages/dashboard/Overview";

/**
 * Phase 8: the real dashboard shell (DashboardLayout) replaces AppPlaceholder. `/app` redirects
 * to `/app/overview`, the only implemented dashboard page so far — the rest of
 * DashboardLayout's nav items are role-aware "Soon" entries until their own phases (9-11) build
 * them. See docs/04_FRONTEND.md.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
        </Route>
      </Route>
    </Routes>
  );
}
