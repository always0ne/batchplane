import type {
  BatchSchedule,
  BatchStatus,
  Criticality,
} from "@batchplane/domain";
import type { BatchChangeDraft } from "@batchplane/ui-client";

export type BatchChangeFormValues = BatchChangeDraft["batch"];

export type ScheduleDraft = {
  key: string;
  source: "existing" | "new";
  status: "active" | "deleted";
  values: BatchSchedule;
};

export type UploadedArtifact = {
  bytes: Uint8Array;
  fileName: string;
};

export const criticalityOptions: Criticality[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];
export const statusOptions: BatchStatus[] = ["ACTIVE", "INACTIVE"];
export const knownRunnerLabels = [
  "ubuntu-latest",
  "ubuntu-24.04",
  "windows-latest",
  "macos-latest",
  "self-hosted",
] as const;

export const defaultBatchChangeFormValues: BatchChangeFormValues = {
  batchId: "",
  criticality: "MEDIUM",
  domain: "",
  environment: "PROD",
  name: "",
  owner: "",
  runCommand: "",
  runnerLabel: "ubuntu-latest",
  status: "ACTIVE",
  workflowRef: "main",
};

export const defaultScheduleValues: BatchSchedule = {
  cron: "0 5 * * *",
  enabled: true,
  name: "",
  scheduleId: "",
  timezone: "Asia/Seoul",
};

export function toBatchChangeDraft({
  artifact,
  existingArtifact,
  governedChangeId,
  mode,
  scheduleDrafts,
  values,
}: {
  artifact?: UploadedArtifact;
  existingArtifact?: BatchChangeDraft["batch"]["existingArtifact"];
  governedChangeId: string;
  mode: BatchChangeDraft["mode"];
  scheduleDrafts: ScheduleDraft[];
  values: BatchChangeFormValues;
}): BatchChangeDraft {
  return {
    ...(artifact ? { artifact } : {}),
    batch: {
      ...normalizeBatchValues(values),
      ...(existingArtifact ? { existingArtifact } : {}),
    },
    governedChangeId,
    mode,
    schedules: scheduleDrafts
      .filter((schedule) => schedule.status === "active")
      .map((schedule) => normalizeSchedule(schedule.values)),
  };
}

export function toScheduleDrafts(schedules: BatchSchedule[]): ScheduleDraft[] {
  return schedules.map((values, index) => ({
    key: `existing-${values.scheduleId || index}`,
    source: "existing",
    status: "active",
    values: { ...values },
  }));
}

export function findBatchChangeMissingFields({
  mode,
  scheduleDrafts,
  values,
}: {
  mode: BatchChangeDraft["mode"];
  scheduleDrafts: ScheduleDraft[];
  values: BatchChangeFormValues;
}): string[] {
  if (mode === "delete") {
    return [];
  }

  const fields: string[] = [];
  const requiredValues: Array<[keyof BatchChangeFormValues, string]> = [
    ["batchId", values.batchId],
    ["name", values.name],
    ["owner", values.owner],
    ["domain", values.domain],
    ["runCommand", values.runCommand],
    ["runnerLabel", values.runnerLabel],
    ["workflowRef", values.workflowRef],
  ];

  requiredValues.forEach(([field, value]) => {
    if (!value.trim()) fields.push(field);
  });

  const activeSchedules = scheduleDrafts.filter(
    (schedule) => schedule.status === "active",
  );
  activeSchedules.forEach((schedule, index) => {
    (["scheduleId", "name", "cron", "timezone"] as const).forEach((field) => {
      if (!schedule.values[field].trim()) {
        fields.push(`schedule[${index + 1}].${field}`);
      }
    });
  });

  const seenScheduleIds = new Set<string>();
  activeSchedules.forEach((schedule) => {
    const scheduleId = schedule.values.scheduleId.trim();
    if (scheduleId && seenScheduleIds.has(scheduleId)) {
      fields.push("duplicateScheduleId");
    }
    seenScheduleIds.add(scheduleId);
  });

  return fields;
}

export function isKnownRunnerLabel(runnerLabel: string): boolean {
  return knownRunnerLabels.includes(
    runnerLabel.trim() as (typeof knownRunnerLabels)[number],
  );
}

function normalizeBatchValues(
  values: BatchChangeFormValues,
): BatchChangeFormValues {
  return {
    ...values,
    batchId: values.batchId.trim(),
    domain: values.domain.trim(),
    name: values.name.trim(),
    owner: values.owner.trim(),
    runCommand: values.runCommand.trim(),
    runnerLabel: values.runnerLabel.trim(),
    workflowRef: values.workflowRef.trim(),
  };
}

function normalizeSchedule(values: BatchSchedule): BatchSchedule {
  return {
    ...values,
    cron: values.cron.trim(),
    name: values.name.trim(),
    scheduleId: values.scheduleId.trim(),
    timezone: values.timezone.trim(),
  };
}
