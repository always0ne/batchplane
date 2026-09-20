import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const packageImportBypass = {
  patterns: [
    {
      group: [
        "@batchplane/*/*",
        "../*/dist/**",
        "../*/src/**",
        "../../*/dist/**",
        "../../*/src/**",
        "**/apps/*/src/**",
        "**/packages/*/src/**",
      ],
      message:
        "Use a package root entrypoint instead of a package source path.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["**/.vite/**", "**/coverage/**", "**/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["{apps,actions,packages}/**/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", packageImportBypass],
    },
  },
  {
    files: ["packages/domain/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...packageImportBypass,
          paths: [
            {
              name: "@batchplane/github-lite",
              message: "Domain must not depend on a provider adapter.",
            },
            {
              name: "@batchplane/ui-client",
              message: "Domain must not depend on the UI client.",
            },
            {
              name: "@batchplane/web",
              message: "Domain must not depend on the Web application.",
            },
          ],
          patterns: [
            ...packageImportBypass.patterns,
            {
              group: ["**/apps/web/**"],
              message: "Domain must not depend on the Web application.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui-client/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...packageImportBypass,
          paths: [
            {
              name: "@batchplane/github-lite",
              message: "The UI client must not depend on a provider adapter.",
            },
            {
              name: "@batchplane/web",
              message: "The UI client must not depend on the Web application.",
            },
          ],
          patterns: [
            ...packageImportBypass.patterns,
            {
              group: ["**/apps/web/**"],
              message: "The UI client must not depend on the Web application.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/github-lite/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...packageImportBypass,
          paths: [
            {
              name: "@batchplane/github-lite",
              message: "GitHub Lite tests import their owning module directly.",
            },
            {
              name: "@batchplane/web",
              message: "The adapter must not depend on the Web application.",
            },
          ],
          patterns: [
            ...packageImportBypass.patterns,
            {
              group: ["**/apps/web/**"],
              message: "The adapter must not depend on the Web application.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/{client,components,pages,ui,shared}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...packageImportBypass,
          paths: [
            {
              name: "@batchplane/github-lite",
              message: "Product code uses the provider-neutral UI client.",
            },
          ],
          patterns: [
            ...packageImportBypass.patterns,
            {
              group: ["**/runtime/**"],
              message: "Product code must not depend on the Web runtime.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/pages/approvals/ApprovalsPage.test.tsx",
      "apps/web/src/pages/audit/AuditPage.test.tsx",
      "apps/web/src/pages/dashboard/DashboardPage.test.tsx",
      "apps/web/src/pages/execution-runs/ExecutionRunDetailPage.test.tsx",
      "apps/web/src/pages/execution-runs/ExecutionRunListPage.test.tsx",
      "apps/web/src/pages/my-work/MyWorkPage.test.tsx",
      "apps/web/src/pages/requests/WorkspaceRequestsPage.test.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", packageImportBypass],
    },
  },
);
