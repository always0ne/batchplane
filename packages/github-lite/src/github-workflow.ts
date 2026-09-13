import type {
  BatchDefinition,
  BatchSchedule,
  RunnerLabel,
} from "@batchplane/domain";

import { getBatchDefinitionPath } from "./batch-definition-codec.js";

const batchPlaneGateActionRef = "always0ne/batchplane/actions/gate@main";
const batchPlaneScheduleRequestActionRef =
  "always0ne/batchplane/actions/schedule-request@main";
const batchPlaneScheduleResultActionRef =
  "always0ne/batchplane/actions/schedule-result@main";

export type GeneratedScheduleCron = {
  cron: string;
  source: "native";
};

export type NativeScheduleWorkflowJobIdentity = {
  businessJobId: string;
  businessJobName: string;
  controlJobId: string;
  controlJobName: string;
};

export function buildBatchWorkflowYaml(definition: BatchDefinition): string {
  const workflowName = definition.name || definition.batchId || "New batch";
  const batchId = definition.batchId || "batch-id";
  const runCommandLines = indentRunCommand(definition.execution?.command ?? "");
  const runner = formatRunnerLabel(
    definition.execution?.runsOn ?? "ubuntu-latest",
  );
  const batchPath = getBatchDefinitionPath(batchId);
  const enabledSchedules = (definition.schedules ?? []).filter(
    (schedule) => schedule.enabled,
  );
  assertUnambiguousScheduleTimezones(enabledSchedules);
  const scheduleEntries = Array.from(
    new Map(
      enabledSchedules
        .map((schedule) => ({
          cron: schedule.cron.trim(),
          timezone: schedule.timezone.trim(),
        }))
        .filter((schedule) => schedule.cron && schedule.timezone)
        .map((schedule) => [
          `${schedule.cron}\u0000${schedule.timezone}`,
          schedule,
        ]),
    ).values(),
  );

  return [
    `name: ${yamlString(`BatchPlane - ${workflowName}`)}`,
    "run-name: BatchPlane ${{ github.event.inputs.batch_id || 'scheduled' }} ${{ github.event.inputs.request_id || github.event.schedule || '' }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        description: BatchPlane execution request ID",
    "        required: true",
    "        type: string",
    "      batch_id:",
    "        description: BatchPlane batch ID",
    "        required: true",
    "        type: string",
    "      request_digest:",
    "        description: BatchPlane approved request digest",
    "        required: true",
    "        type: string",
    "      schedule_id:",
    "        description: BatchPlane schedule identifier for scheduled dispatches",
    "        required: false",
    "        type: string",
    ...(scheduleEntries.length > 0
      ? [
          "  schedule:",
          ...scheduleEntries.map(
            (schedule) =>
              `    - cron: ${yamlString(schedule.cron)}\n      timezone: ${yamlString(schedule.timezone)}`,
          ),
        ]
      : []),
    "",
    "jobs:",
    ...enabledSchedules.flatMap((schedule) =>
      buildScheduledRequestJobLines({
        batchId,
        batchPath,
        runCommand: definition.execution?.command ?? "",
        runner,
        schedule,
      }),
    ),
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    if: github.event_name == 'workflow_dispatch'",
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    outputs:",
    "      verified_sha: ${{ steps.verify.outputs.verified_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "      pull-requests: read",
    "    steps:",
    "      - name: Verify approved execution evidence",
    "        id: verify",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    "          batch-id: ${{ inputs.batch_id }}",
    "          config-path: .batch-governance",
    "          request-id: ${{ inputs.request_id }}",
    "          approval-source: issue",
    "          approval-ref: ${{ inputs.request_id }}",
    "          request-digest: ${{ inputs.request_digest }}",
    "          schedule-id: ${{ inputs.schedule_id }}",
    "          gate-job-name: BatchPlane Gate",
    "          gate-step-name: Verify approved execution evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-batch:",
    "    name: Run governed batch",
    "    if: github.event_name == 'workflow_dispatch' && needs.batchplane-gate.outputs.verified_sha != ''",
    `    runs-on: ${runner}`,
    "    needs: batchplane-gate",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - name: Checkout registered assets",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ needs.batchplane-gate.outputs.verified_sha }}",
    "",
    "      - name: Run batch",
    "        run: |",
    '          echo "::group::BatchPlane batch command"',
    "          trap 'status=$?; echo \"::endgroup::\"; exit $status' EXIT",
    `          echo ${yamlString(`BatchPlane approved execution for ${batchId}`)}`,
    ...runCommandLines,
    "",
  ].join("\n");
}
function yamlString(value: string): string {
  return JSON.stringify(value);
}

function githubExpressionString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
function indentRunCommand(runCommand: string): string[] {
  const lines = runCommand.trimEnd().split("\n");

  if (lines.length === 0 || lines.every((line) => !line.trim())) {
    return [
      "          # Define the governed batch command during registration.",
    ];
  }

  return lines.map((line) => `          ${line}`);
}

function formatRunnerLabel(runnerLabel: RunnerLabel): string {
  if (Array.isArray(runnerLabel)) {
    return `[${runnerLabel.map(yamlString).join(", ")}]`;
  }

  return yamlString(runnerLabel || "ubuntu-latest");
}

function buildScheduledRequestJobLines({
  batchId,
  batchPath,
  runCommand,
  runner,
  schedule,
}: {
  batchId: string;
  batchPath: string;
  runCommand: string;
  runner: string;
  schedule: BatchSchedule;
}): string[] {
  const identity = getNativeScheduleWorkflowJobIdentity(schedule);
  const {
    businessJobId,
    businessJobName,
    controlJobId: jobId,
    controlJobName,
  } = identity;

  return [
    `  ${jobId}:`,
    `    name: ${yamlString(controlJobName)}`,
    `    if: github.event_name == 'schedule' && github.event.schedule == ${githubExpressionString(schedule.cron)}`,
    "    outputs:",
    "      request-id: ${{ steps.schedule_request.outputs.request-id }}",
    "      request-digest: ${{ steps.schedule_request.outputs.request-digest }}",
    "      issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "    concurrency:",
    `      group: ${yamlString(`batchplane-schedule-${toWorkflowJobId(batchId)}-${toScheduleWorkflowJobId(schedule.scheduleId)}`)}`,
    "      cancel-in-progress: false",
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: write",
    "      pull-requests: read",
    "    steps:",
    "      - name: Record native scheduled execution request",
    "        id: schedule_request",
    "        continue-on-error: true",
    `        uses: ${batchPlaneScheduleRequestActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          cron: ${yamlString(schedule.cron)}`,
    `          timezone: ${yamlString(schedule.timezone)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          config-path: .batch-governance",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Verify approved native schedule evidence",
    "        id: verify",
    "        if: always()",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    `          batch-id: ${yamlString(batchId)}`,
    "          config-path: .batch-governance",
    "          request-id: ${{ steps.schedule_request.outputs.request-id }}",
    "          request-digest: ${{ steps.schedule_request.outputs.request-digest }}",
    "          issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "          controller-reason: ${{ steps.schedule_request.outputs.failure-reason }}",
    "          record-evidence: true",
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          gate-job-name: ${yamlString(controlJobName)}`,
    "          gate-step-name: Verify approved native schedule evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    `  ${businessJobId}:`,
    `    name: ${yamlString(businessJobName)}`,
    `    needs: ${jobId}`,
    `    if: github.event_name == 'schedule' && needs.${jobId}.result == 'success'`,
    `    runs-on: ${runner}`,
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "      pull-requests: read",
    "    steps:",
    "      - name: Reverify approved native schedule evidence",
    "        id: verify",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    `          batch-id: ${yamlString(batchId)}`,
    "          config-path: .batch-governance",
    `          request-id: \${{ needs.${jobId}.outputs.request-id }}`,
    `          request-digest: \${{ needs.${jobId}.outputs.request-digest }}`,
    `          issue-number: \${{ needs.${jobId}.outputs.issue-number }}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          gate-job-name: ${yamlString(businessJobName)}`,
    "          gate-step-name: Reverify approved native schedule evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Checkout registered assets",
    "        if: steps.verify.outputs.verified_sha != ''",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ steps.verify.outputs.verified_sha }}",
    "      - name: Run batch",
    "        if: steps.verify.outputs.verified_sha != ''",
    "        run: |",
    '          echo "::group::BatchPlane batch command"',
    "          trap 'status=$?; echo \"::endgroup::\"; exit $status' EXIT",
    `          echo ${yamlString(`BatchPlane approved execution for ${batchId}`)}`,
    ...indentRunCommand(runCommand),
    "",
    `  result-${jobId}:`,
    `    name: ${yamlString(`Record ${schedule.name || schedule.scheduleId} result`)}`,
    `    needs: [${jobId}, ${businessJobId}]`,
    `    if: github.event_name == 'schedule' && github.event.schedule == ${githubExpressionString(schedule.cron)} && always() && needs.${jobId}.outputs.issue-number != ''`,
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      actions: read",
    "      contents: read",
    "      issues: write",
    "      pull-requests: read",
    "    steps:",
    "      - name: Record native schedule result",
    `        uses: ${batchPlaneScheduleResultActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          issue-number: \${{ needs.${jobId}.outputs.issue-number }}`,
    `          request-id: \${{ needs.${jobId}.outputs.request-id }}`,
    `          request-digest: \${{ needs.${jobId}.outputs.request-digest }}`,
    `          control-result: \${{ needs.${jobId}.result }}`,
    `          business-result: \${{ needs.${businessJobId}.result }}`,
    `          business-job-id: ${yamlString(businessJobId)}`,
    `          business-job-name: ${yamlString(businessJobName)}`,
    `          control-job-id: ${yamlString(jobId)}`,
    `          control-job-name: ${yamlString(controlJobName)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ];
}

export function getGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): GeneratedScheduleCron[] {
  const cron = schedule.cron.trim();
  const timezone = schedule.timezone.trim();
  validateTimeZone(timezone);
  if (cron.split(/\s+/u).length !== 5) {
    throw new Error("GitHub Actions schedules require a 5-field cron.");
  }
  return [{ cron, source: "native" }];
}

export function formatGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): string {
  return getGeneratedScheduleCrons(schedule)
    .map((entry) => entry.cron)
    .join(", ");
}

/**
 * Keeps execution evidence and generated YAML on one schedule-specific job
 * identity. Callers must derive this from registered schedule data, never a
 * mutable result comment.
 */
export function getNativeScheduleWorkflowJobIdentity(
  schedule: Pick<BatchSchedule, "scheduleId">,
): NativeScheduleWorkflowJobIdentity {
  const controlJobId = toScheduleWorkflowJobId(schedule.scheduleId);

  return {
    businessJobId: `run-${controlJobId}`,
    businessJobName: `Run [${schedule.scheduleId}]`,
    controlJobId,
    controlJobName: `Schedule [${schedule.scheduleId}]`,
  };
}

/** GitHub exposes only the cron expression in github.event.schedule. */
export function assertUnambiguousScheduleTimezones(
  schedules: readonly Pick<BatchSchedule, "cron" | "timezone">[],
): void {
  const timezoneByCron = new Map<string, string>();

  for (const schedule of schedules) {
    const cron = schedule.cron.trim();
    const timezone = schedule.timezone.trim();
    const existing = timezoneByCron.get(cron);

    if (existing && existing !== timezone) {
      throw new Error(
        `SCHEDULE_TIMEZONE_AMBIGUOUS: schedules with cron ${cron} must use one timezone per workflow.`,
      );
    }
    timezoneByCron.set(cron, timezone);
  }
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}

function toWorkflowJobId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "schedule_request"
  );
}

function toScheduleWorkflowJobId(scheduleId: string): string {
  const encoded = Array.from(scheduleId)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join("_");

  return `schedule_${encoded}`;
}
