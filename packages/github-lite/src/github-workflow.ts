import { CronExpressionParser } from "cron-parser";
import type {
  BatchDefinition,
  BatchSchedule,
  RunnerLabel,
} from "@batchplane/domain";

import { getBatchDefinitionPath } from "./batch-definition-codec.js";

const batchPlaneDispatcherActionRef =
  "always0ne/batchplane/actions/dispatcher@main";
const batchPlaneGateActionRef = "always0ne/batchplane/actions/gate@main";
const batchPlaneScheduleRequestActionRef =
  "always0ne/batchplane/actions/schedule-request@main";

export type GeneratedScheduleCron = {
  cron: string;
  source: "original" | "utc";
};

const scheduleCronSampleStart = new Date("2026-01-01T00:00:00.000Z");
const scheduleCronOccurrenceSampleSize = 512;
const scheduleTimezoneOffsetSampleDates = [
  new Date("2026-01-01T12:00:00.000Z"),
  new Date("2026-04-01T12:00:00.000Z"),
  new Date("2026-07-01T12:00:00.000Z"),
  new Date("2026-10-01T12:00:00.000Z"),
] as const;

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
  const scheduleEntries = Array.from(
    new Map(
      enabledSchedules
        .flatMap((schedule) =>
          getGeneratedScheduleCrons(schedule).map((entry) => ({
            cron: entry.cron,
          })),
        )
        .filter((schedule) => schedule.cron)
        .map((schedule) => [schedule.cron, schedule]),
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
            (schedule) => `    - cron: ${yamlString(schedule.cron)}`,
          ),
        ]
      : []),
    "",
    "jobs:",
    ...enabledSchedules.flatMap((schedule) =>
      buildScheduledRequestJobLines({
        batchId,
        batchPath,
        schedule,
      }),
    ),
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    if: github.event_name == 'workflow_dispatch'",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "    steps:",
    "      - name: Verify approved execution evidence",
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
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-batch:",
    "    name: Run governed batch",
    "    if: github.event_name == 'workflow_dispatch'",
    `    runs-on: ${runner}`,
    "    needs: batchplane-gate",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - name: Checkout registered assets",
    "        uses: actions/checkout@v4",
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
  schedule,
}: {
  batchId: string;
  batchPath: string;
  schedule: BatchSchedule;
}): string[] {
  const jobId = toScheduleWorkflowJobId(schedule.scheduleId);
  const generatedCrons = getGeneratedScheduleCrons(schedule).map(
    (entry) => entry.cron,
  );

  return [
    `  ${jobId}:`,
    `    name: ${yamlString(`Schedule ${schedule.name || schedule.scheduleId}`)}`,
    `    if: github.event_name == 'schedule' && (${formatGitHubScheduleMatchExpression(generatedCrons)}) && github.run_attempt == 1`,
    "    concurrency:",
    `      group: ${yamlString(`batchplane-schedule-${toWorkflowJobId(batchId)}-${toScheduleWorkflowJobId(schedule.scheduleId)}`)}`,
    "      cancel-in-progress: false",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      actions: write",
    "      contents: read",
    "      issues: write",
    "    steps:",
    "      - name: Create or reuse scheduled execution request",
    "        id: schedule_request",
    `        uses: ${batchPlaneScheduleRequestActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          cron: ${yamlString(schedule.cron)}`,
    `          timezone: ${yamlString(schedule.timezone)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          config-path: .batch-governance",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Dispatch approved scheduled request",
    "        if: steps.schedule_request.outputs.approval-comment-id != ''",
    `        uses: ${batchPlaneDispatcherActionRef}`,
    "        with:",
    "          issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "          comment-id: ${{ steps.schedule_request.outputs.approval-comment-id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ];
}

export function getGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): GeneratedScheduleCron[] {
  const cron = schedule.cron.trim();
  const timezone = schedule.timezone.trim();
  const fields = parseGitHubCronFields(cron);

  validateTimeZone(timezone);
  CronExpressionParser.parse(cron, {
    currentDate: scheduleCronSampleStart,
    tz: timezone,
  });

  if (timezone === "UTC" || timezone === "Etc/UTC") {
    return [{ cron, source: "original" }];
  }

  if (
    fields.dayOfMonth === "*" &&
    fields.month === "*" &&
    fields.dayOfWeek === "*"
  ) {
    return convertDailyCronToUtcCronEntries(fields, timezone).map((entry) => ({
      cron: entry,
      source: "utc",
    }));
  }

  return convertCronOccurrencesToUtcCronEntries(cron, timezone, fields).map(
    (entry) => ({
      cron: entry,
      source: "utc",
    }),
  );
}

export function formatGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): string {
  return getGeneratedScheduleCrons(schedule)
    .map((entry) => entry.cron)
    .join(", ");
}

function parseGitHubCronFields(cron: string): {
  dayOfMonth: string;
  dayOfWeek: string;
  hour: string;
  minute: string;
  month: string;
} {
  const fields = cron.trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error("GitHub Actions schedules require a 5-field cron.");
  }

  return {
    dayOfMonth: fields[2] ?? "*",
    dayOfWeek: fields[4] ?? "*",
    hour: fields[1] ?? "*",
    minute: fields[0] ?? "*",
    month: fields[3] ?? "*",
  };
}

function convertDailyCronToUtcCronEntries(
  fields: ReturnType<typeof parseGitHubCronFields>,
  timezone: string,
): string[] {
  const minutes = expandSimpleCronField(fields.minute, 0, 59);
  const hours = expandSimpleCronField(fields.hour, 0, 23);
  const offsets = getObservedTimezoneOffsets(timezone);
  const minuteHourPairs = new Set<string>();

  for (const offset of offsets) {
    for (const hour of hours) {
      for (const minute of minutes) {
        const utcTotalMinutes = normalizeModulo(
          hour * 60 + minute - offset,
          24 * 60,
        );
        const utcHour = Math.floor(utcTotalMinutes / 60);
        const utcMinute = utcTotalMinutes % 60;

        minuteHourPairs.add(`${utcMinute} ${utcHour}`);
      }
    }
  }

  return formatMinuteHourCronEntries(minuteHourPairs);
}

function convertCronOccurrencesToUtcCronEntries(
  cron: string,
  timezone: string,
  fields: ReturnType<typeof parseGitHubCronFields>,
): string[] {
  const interval = CronExpressionParser.parse(cron, {
    currentDate: scheduleCronSampleStart,
    tz: timezone,
  });
  const entries = new Set<string>();

  for (let index = 0; index < scheduleCronOccurrenceSampleSize; index += 1) {
    const next = interval.next().toDate();
    const minute = next.getUTCMinutes();
    const hour = next.getUTCHours();
    const dayOfMonth = next.getUTCDate();
    const month = next.getUTCMonth() + 1;
    const dayOfWeek = next.getUTCDay();

    if (
      fields.dayOfMonth === "*" &&
      fields.month === "*" &&
      fields.dayOfWeek !== "*"
    ) {
      entries.add(`${minute} ${hour} * * ${dayOfWeek}`);
    } else if (
      fields.dayOfMonth !== "*" &&
      fields.month === "*" &&
      fields.dayOfWeek === "*"
    ) {
      entries.add(`${minute} ${hour} ${dayOfMonth} * *`);
    } else {
      entries.add(`${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`);
    }
  }

  return [...entries].sort(compareCronText);
}

function formatMinuteHourCronEntries(pairs: Set<string>): string[] {
  const minutesByHour = new Map<number, Set<number>>();

  for (const pair of pairs) {
    const [minuteText = "", hourText = ""] = pair.split(" ");
    const minute = Number(minuteText);
    const hour = Number(hourText);
    const minutes = minutesByHour.get(hour) ?? new Set<number>();

    minutes.add(minute);
    minutesByHour.set(hour, minutes);
  }

  return [...minutesByHour.entries()]
    .sort(([left], [right]) => left - right)
    .map(
      ([hour, minutes]) =>
        `${formatCronNumberList(
          [...minutes].sort((left, right) => left - right),
        )} ${hour} * * *`,
    );
}

function expandSimpleCronField(
  field: string,
  min: number,
  max: number,
): number[] {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const [rangeText = "", stepText] = trimmed.split("/");
    const step = stepText ? Number(stepText) : 1;

    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step: ${trimmed}`);
    }

    let start = min;
    let end = max;

    if (rangeText !== "*") {
      if (rangeText.includes("-")) {
        const rangeValues = rangeText.split("-").map(Number);

        start = rangeValues[0] ?? Number.NaN;
        end = rangeValues[1] ?? Number.NaN;
      } else {
        start = Number(rangeText);
        end = start;
      }
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      throw new Error(`Unsupported cron field: ${field}`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return [...values].sort((left, right) => left - right);
}

function getObservedTimezoneOffsets(timezone: string): number[] {
  const offsets = new Set<number>();

  for (const sampleDate of scheduleTimezoneOffsetSampleDates) {
    offsets.add(getTimezoneOffsetMinutes(sampleDate, timezone));
  }

  return [...offsets].sort((left, right) => left - right);
}

function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((zonedAsUtc - date.getTime()) / 60_000);
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}

function normalizeModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function formatCronNumberList(values: number[]): string {
  return values.join(",");
}

function formatGitHubScheduleMatchExpression(crons: string[]): string {
  return crons
    .map((cron) => `github.event.schedule == ${githubExpressionString(cron)}`)
    .join(" || ");
}

function compareCronText(left: string, right: string): number {
  return left.localeCompare(right, "en-US", { numeric: true });
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
