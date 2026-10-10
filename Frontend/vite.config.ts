import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, /api is proxied to the Express server, so the frontend needs no hardcoded URL.
// In production set VITE_API_URL (e.g. https://your-api.example.com) at build time, or serve both from one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
