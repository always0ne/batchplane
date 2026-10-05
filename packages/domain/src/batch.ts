export type BatchStatus = "ACTIVE" | "INACTIVE";

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BatchSchedule = {
  scheduleId: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

/** The provider-neutral business definition of a managed batch. */
export type BatchDefinition = {
  batchId: string;
  name: string;
  owner: string;
  domain: string;
  environment: string;
  criticality: Criticality;
  status: BatchStatus;
  gateRequired: boolean;
  description?: string;
  labels?: string[];
  schedules?: BatchSchedule[];
};
