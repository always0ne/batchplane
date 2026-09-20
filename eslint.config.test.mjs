import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));

async function lintImport(path, source) {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const [result] = await eslint.lintText(source, {
    filePath: resolve(repositoryRoot, path),
  });

  return result.messages.filter(
    (message) => message.ruleId === "no-restricted-imports",
  );
}

for (const [path, source] of [
  [
    "apps/web/src/pages/batches/list/BatchListPage.tsx",
    'import "@batchplane/github-lite";',
  ],
  [
    "apps/web/src/pages/requests/execution/ExecutionApprovalActions.tsx",
    'import "@batchplane/github-lite";',
  ],
  ["apps/web/src/components/Button.tsx", 'import "@batchplane/github-lite";'],
  [
    "apps/web/src/pages/batches/list/BatchListPage.tsx",
    'import type { GitHubLiteClient } from "@batchplane/github-lite";',
  ],
  [
    "apps/web/src/pages/batches/list/BatchListPage.tsx",
    'export { createGitHubLiteClient } from "@batchplane/github-lite";',
  ],
  [
    "apps/web/src/pages/batches/list/BatchListPage.tsx",
    'import "../../../runtime/runtime-fixtures";',
  ],
  [
    "apps/web/src/components/Button.tsx",
    'import "../runtime/runtime-fixtures";',
  ],
  [
    "apps/web/src/pages/requests/changes/GovernedChangePreviewPanel.tsx",
    'import "../../../runtime/runtime-fixtures";',
  ],
  ["packages/domain/src/index.ts", 'import "@batchplane/ui-client";'],
  ["packages/domain/src/index.ts", 'import "@batchplane/web";'],
  ["packages/ui-client/src/batches.ts", 'import "@batchplane/github-lite";'],
  ["packages/ui-client/src/batches.ts", 'import "@batchplane/web";'],
  ["packages/github-lite/src/product-client.ts", 'import "@batchplane/web";'],
  ["packages/domain/src/index.ts", 'import "../../github-lite/src/index.js";'],
  ["packages/domain/src/index.ts", 'import "../../github-lite/dist/index.js";'],
  [
    "apps/web/src/pages/approvals/ApprovalsPage.test.tsx",
    'import "@batchplane/github-lite/product-client";',
  ],
]) {
  test(`rejects ${source} from ${path}`, async () => {
    assert.equal((await lintImport(path, source)).length, 1);
  });
}

for (const [path, source] of [
  [
    "apps/web/src/runtime/runtime-fixtures.ts",
    'import "@batchplane/github-lite";',
  ],
  ["actions/gate/src/index.ts", 'import "@batchplane/github-lite";'],
  [
    "apps/web/src/pages/approvals/ApprovalsPage.test.tsx",
    'import "@batchplane/github-lite";',
  ],
  [
    "apps/web/src/pages/dashboard/DashboardPage.test.tsx",
    'import "../../runtime/runtime-fixtures";',
  ],
  [
    "apps/web/src/pages/batches/list/BatchListPage.tsx",
    'import type { BatchPlaneClient } from "@batchplane/ui-client";',
  ],
  [
    "apps/web/src/pages/requests/changes/GovernedChangePreviewPanel.tsx",
    'import type { GovernedChangePreviewFile } from "@batchplane/ui-client";',
  ],
]) {
  test(`allows ${source} from ${path}`, async () => {
    assert.equal((await lintImport(path, source)).length, 0);
  });
}
