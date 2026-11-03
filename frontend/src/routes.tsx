import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import DashboardLayout from "./layouts/DashboardLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Approvals from "./pages/dashboard/Approvals";
import Assistant from "./pages/dashboard/Assistant";
import HrInsights from "./pages/dashboard/HrInsights";
import KnowledgeBase from "./pages/dashboard/KnowledgeBase";
import Overview from "./pages/dashboard/Overview";
import Team from "./pages/dashboard/Team";
import Tickets from "./pages/dashboard/Tickets";

/**
 * Phase 10 adds Tickets/Approvals/Team/HR Insights/Policy Knowledge Base. `/app` redirects to
 * `/app/overview`; Control Room/Reinforcement Lab/Evaluation/Costs/Audit Log stay role-aware
 * "Soon" nav entries until Phase 10B/11 builds them. See docs/04_FRONTEND.md.
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
          <Route path="tickets" element={<Tickets />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="team" element={<Team />} />
          <Route path="hr-insights" element={<HrInsights />} />
          <Route path="kb" element={<KnowledgeBase />} />
        </Route>
      </Route>
    </Routes>
  );
}
