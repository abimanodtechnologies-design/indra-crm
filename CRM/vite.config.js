import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    assetsDir: "",
  },

  server: {
    port: 5173,
    proxy: {
      // Every request starting with /api is forwarded to the backend
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});