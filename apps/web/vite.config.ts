import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // `convex dev` writes CONVEX_URL to packages/backend/.env.local. The prefix
  // keeps every other variable in that file out of the browser bundle.
  const backendEnv = loadEnv(mode, "../../packages/backend", "CONVEX_URL");

  return {
    resolve: { tsconfigPaths: true },
    define: {
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(
        process.env.VITE_CONVEX_URL ?? backendEnv.CONVEX_URL,
      ),
    },
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
  };
});
