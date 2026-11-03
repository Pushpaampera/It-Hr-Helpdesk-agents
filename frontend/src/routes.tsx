import { Route, Routes } from "react-router-dom";

import Landing from "./pages/Landing";
import LoginPlaceholder from "./pages/LoginPlaceholder";

/**
 * Phase 6: the real cinematic landing page replaces PlaceholderHome. `/login` is a temporary
 * stand-in until Phase 7 builds the real login page; Phase 8+ adds the `/app/*` dashboard
 * routes described in docs/04_FRONTEND.md.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPlaceholder />} />
    </Routes>
  );
}
