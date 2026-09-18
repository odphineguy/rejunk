import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only (pure engines under client/src/utils). Kept separate from
 * vite.config.ts so the dev-server middleware never loads during `pnpm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["client/src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
