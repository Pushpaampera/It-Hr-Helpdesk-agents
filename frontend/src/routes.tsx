import { Navigate, Route, Routes } from "react-router-dom";

import RequireAuth from "./components/RequireAuth";
import DashboardLayout from "./layouts/DashboardLayout";
import Landing from "./pages/Landing";
import ChangePassword from "./pages/ChangePassword";
import Login from "./pages/Login";
import Approvals from "./pages/dashboard/Approvals";
import Assistant from "./pages/dashboard/Assistant";
import AuditLog from "./pages/dashboard/AuditLog";
import ControlRoom from "./pages/dashboard/ControlRoom";
import Costs from "./pages/dashboard/Costs";
import Evaluation from "./pages/dashboard/Evaluation";
import HrInsights from "./pages/dashboard/HrInsights";
import KnowledgeBase from "./pages/dashboard/KnowledgeBase";
import Overview from "./pages/dashboard/Overview";
import PasswordResets from "./pages/dashboard/PasswordResets";
import ReinforcementLab from "./pages/dashboard/ReinforcementLab";
import Tickets from "./pages/dashboard/Tickets";
import TalkToHr from "./pages/dashboard/TalkToHr";
import HrCases from "./pages/dashboard/HrCases";

/**
 * Phase 11 adds the last admin-only pages: Control Room, Reinforcement Lab, Evaluation, Costs,
 * Audit Log. `/app` redirects to `/app/overview`. Every nav item in `navItems.ts` is now
 * `implemented: true`. See docs/04_FRONTEND.md.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="password-resets" element={<PasswordResets />} />
          <Route path="hr-support" element={<TalkToHr />} />
          <Route path="hr-cases" element={<HrCases />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="hr-insights" element={<HrInsights />} />
          <Route path="kb" element={<KnowledgeBase />} />
          <Route path="control-room" element={<ControlRoom />} />
          <Route path="reinforcement-lab" element={<ReinforcementLab />} />
          <Route path="evaluation" element={<Evaluation />} />
          <Route path="costs" element={<Costs />} />
          <Route path="audit-log" element={<AuditLog />} />
        </Route>
      </Route>
    </Routes>
  );
}
