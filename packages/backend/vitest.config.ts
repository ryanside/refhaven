import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Confect's function specs are named *.spec.ts, which Vitest would run as tests.
    include: ["confect/**/*.test.ts"],
  },
});
