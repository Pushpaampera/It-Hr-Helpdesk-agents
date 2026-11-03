import { Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import AppPlaceholder from "./pages/AppPlaceholder";
import Landing from "./pages/Landing";
import Login from "./pages/Login";

/**
 * Phase 7: the real login page replaces LoginPlaceholder. `/app` is a temporary, auth-gated
 * stand-in for the role-specific dashboard shell Phase 8+ builds (Overview, AI Assistant, HR
 * Insights, Control Room, etc. — see docs/04_FRONTEND.md).
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppPlaceholder />} />
      </Route>
    </Routes>
  );
}
