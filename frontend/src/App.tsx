import { useEffect } from "react";

import AppRoutes from "./routes";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const refreshMe = useAuthStore((s) => s.refreshMe);

  useEffect(() => {
    // Validates a persisted token against the backend on first load (e.g. after a page
    // refresh) — if it's expired or revoked, refreshMe() logs the session out itself.
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppRoutes />;
}
