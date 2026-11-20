import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to another port when the
    // Docker frontend container is already using 5173.
    strictPort: true,
  },
});
