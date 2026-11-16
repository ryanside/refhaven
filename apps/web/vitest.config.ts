import { defineConfig } from "vitest/config";

// The app's vite.config.ts loads the TanStack Start plugin, which unit tests do not need.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
