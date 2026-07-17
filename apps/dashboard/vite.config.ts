/// <reference types="vitest/config" />
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:4100",
      // Sin esto, un socket.io-client sin URL explícita conecta al origin de
      // la propia página (este dev server), que no proxea upgrades de
      // WebSocket salvo declaración explícita (`ws: true`).
      "/socket.io": { target: "http://localhost:4100", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
