import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { parseDocument } from "yaml";

const repositoryRoot = resolve(import.meta.dirname, "..");
const actionlintCommand = process.env.ACTIONLINT_BIN ?? "actionlint";
const temporaryDirectory = mkdtempSync(
  resolve(tmpdir(), "batchplane-workflow-integrity-"),
);

try {
  const [installationModel, registrationModel] = await Promise.all([
    loadWorkflowBuilder(
      "apps/web/src/features/lite-setup/installation-model.ts",
      "installation-model",
    ),
    loadWorkflowBuilder(
      "apps/web/src/features/registration/registration-model.ts",
      "registration-model",
    ),
  ]);
  const workflows = buildGeneratedWorkflows(
    installationModel,
    registrationModel,
  );
  const generatedPaths = workflows.map(({ content, name }) => {
    const path = resolve(temporaryDirectory, name);
    assertYamlParses(path, content);
    writeFileSync(path, content, "utf8");
    return path;
  });

  assertGeneratedWorkflowContracts(workflows);
  const staticPaths = listStaticWorkflowPaths();

  for (const path of staticPaths) {
    assertYamlParses(path, readFileSync(path, "utf8"));
  }

  runActionlint([...staticPaths, ...generatedPaths], "valid workflows");
  assertInvalidCronExpressionIsRejected();
  console.log("Static and generated workflow integrity verified.");
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

async function loadWorkflowBuilder(sourcePath, outputName) {
  const outputPath = resolve(temporaryDirectory, `${outputName}.mjs`);

  await build({
    alias: {
      "@batchplane/digest": resolve(
        repositoryRoot,
        "packages/digest/src/index.ts",
      ),
      "@batchplane/domain": resolve(
        repositoryRoot,
        "packages/domain/src/index.ts",
      ),
      "@batchplane/github-lite": resolve(
        repositoryRoot,
        "packages/github-lite/src/index.ts",
      ),
    },
    bundle: true,
    entryPoints: [resolve(repositoryRoot, sourcePath)],
    format: "esm",
    outfile: outputPath,
    platform: "node",
    target: "node24",
    tsconfig: resolve(repositoryRoot, "tsconfig.base.json"),
  });

  return import(pathToFileURL(outputPath).href);
}

function buildGeneratedWorkflows(installationModel, registrationModel) {
  const manualBatch = {
    batchId: "payments.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: {
      command: "./scripts/daily-close.sh",
      runsOn: "ubuntu-24.04",
    },
    gateRequired: true,
    name: "Daily close",
    owner: "payments-ops",
    status: "ACTIVE",
    workflow: {
      path: ".github/workflows/payments.daily-close.yml",
      ref: "main",
    },
  };
  const scheduledBatch = {
    ...manualBatch,
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        name: "Seoul business-day close",
        scheduleId: "payments.daily-close-seoul",
        timezone: "Asia/Seoul",
      },
    ],
  };

  return [
    {
      content: installationModel.buildDispatcherWorkflowYaml(),
      name: "generated-dispatcher.yml",
    },
    {
      content: installationModel.buildSampleTargetWorkflowYaml(),
      name: "generated-sample-target.yml",
    },
    {
      content: registrationModel.buildBatchWorkflowYaml(
        manualBatch,
        manualBatch.execution.command,
        manualBatch.execution.runsOn,
      ),
      name: "generated-batch-manual.yml",
    },
    {
      content: registrationModel.buildBatchWorkflowYaml(
        scheduledBatch,
        scheduledBatch.execution.command,
        scheduledBatch.execution.runsOn,
      ),
      name: "generated-batch-scheduled.yml",
    },
  ];
}

function assertGeneratedWorkflowContracts(workflows) {
  const byName = new Map(
    workflows.map((workflow) => [workflow.name, workflow.content]),
  );
  const manual = parseDocument(byName.get("generated-batch-manual.yml")).toJS();
  const scheduled = parseDocument(
    byName.get("generated-batch-scheduled.yml"),
  ).toJS();

  if (!manual.on?.workflow_dispatch || manual.on.schedule) {
    throw new Error(
      "The generated manual batch workflow must expose only workflow_dispatch.",
    );
  }

  if (
    !scheduled.on?.workflow_dispatch ||
    scheduled.on.schedule?.[0]?.cron !== "0 20 * * *" ||
    !scheduled.jobs?.schedule_payments_daily_close_seoul
  ) {
    throw new Error(
      "The generated scheduled batch workflow must include its timezone-converted cron and schedule job.",
    );
  }

  if (!byName.get("generated-dispatcher.yml")?.includes("issue_comment:")) {
    throw new Error(
      "The generated dispatcher workflow must subscribe to issue comments.",
    );
  }

  if (
    !byName.get("generated-sample-target.yml")?.includes("batchplane-gate:")
  ) {
    throw new Error(
      "The generated sample target workflow must include BatchPlane Gate.",
    );
  }
}

function assertYamlParses(path, content) {
  const document = parseDocument(content);

  if (document.errors.length > 0) {
    throw new Error(
      `${path} is not valid YAML: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }
}

function listStaticWorkflowPaths() {
  const workflowDirectory = resolve(repositoryRoot, ".github/workflows");

  return readdirSync(workflowDirectory)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort()
    .map((entry) => resolve(workflowDirectory, entry));
}

function assertInvalidCronExpressionIsRejected() {
  const invalidPath = resolve(
    temporaryDirectory,
    "invalid-double-quoted-cron.yml",
  );
  const invalidWorkflow = [
    "name: Invalid scheduled workflow",
    "on:",
    "  schedule:",
    '    - cron: "35 08 * * *"',
    "jobs:",
    "  scheduled-run:",
    "    if: github.event_name == 'schedule' && github.event.schedule == \"35 08 * * *\" && github.run_attempt == 1",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo invalid",
    "",
  ].join("\n");

  assertYamlParses(invalidPath, invalidWorkflow);
  writeFileSync(invalidPath, invalidWorkflow, "utf8");

  const result = executeActionlint([invalidPath]);

  if (result.status === 0) {
    throw new Error(
      "actionlint accepted the known-invalid double-quoted cron expression in a GitHub expression.",
    );
  }
}

function runActionlint(paths, subject) {
  const result = executeActionlint(paths);

  if (result.status !== 0) {
    throw new Error(
      `actionlint rejected ${subject}:\n${[result.stdout, result.stderr].filter(Boolean).join("\n")}`,
    );
  }
}

function executeActionlint(paths) {
  const result = spawnSync(actionlintCommand, ["-shellcheck=", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(
      `Could not run ${actionlintCommand}. Install the pinned official tool with pnpm bootstrap:actionlint and ensure $(go env GOPATH)/bin is on PATH.`,
    );
  }

  return result;
}
