import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Overridable because this sandbox sometimes has an unrelated process already bound to
      // 8000 — see HANDOFF.md's "Environment quirk". `BACKEND_PORT=8099 npm run dev` points the
      // proxy elsewhere without editing this file.
      "/api": {
        target: `http://localhost:${process.env.BACKEND_PORT ?? 8000}`,
        changeOrigin: true,
      },
    },
  },
});
