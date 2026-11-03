import { Route, Routes } from "react-router-dom";

import PlaceholderHome from "./pages/PlaceholderHome";

/**
 * Phase 1: only the placeholder route exists. Phase 6+ adds the real landing,
 * login, and /app/* dashboard routes described in docs/04_FRONTEND.md.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderHome />} />
    </Routes>
  );
}
