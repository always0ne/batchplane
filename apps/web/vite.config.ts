import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@batchtrail/domain": new URL(
        "../../packages/domain/src/index.ts",
        import.meta.url,
      ).pathname,
      "@batchtrail/github-lite": new URL(
        "../../packages/github-lite/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
