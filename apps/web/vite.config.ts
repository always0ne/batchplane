import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const digestSource = fileURLToPath(
  new URL("../../packages/digest/src/index.ts", import.meta.url),
);
const domainSource = fileURLToPath(
  new URL("../../packages/domain/src/index.ts", import.meta.url),
);
const githubLiteSource = fileURLToPath(
  new URL("../../packages/github-lite/src/index.ts", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@batchtrail/domain", "@batchtrail/github-lite"],
  },
  resolve: {
    alias: [
      { find: "@batchtrail/digest", replacement: digestSource },
      { find: "@batchtrail/domain", replacement: domainSource },
      { find: "@batchtrail/github-lite", replacement: githubLiteSource },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
