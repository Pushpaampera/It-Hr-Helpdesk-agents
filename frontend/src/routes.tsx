import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import DashboardLayout from "./layouts/DashboardLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Assistant from "./pages/dashboard/Assistant";
import Overview from "./pages/dashboard/Overview";

/**
 * Phase 9 adds the AI Assistant page. `/app` redirects to `/app/overview`; the rest of
 * DashboardLayout's nav items stay role-aware "Soon" entries until Phases 10-11 build them.
 * See docs/04_FRONTEND.md.
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
          <Route path="assistant" element={<Assistant />} />
        </Route>
      </Route>
    </Routes>
  );
}
