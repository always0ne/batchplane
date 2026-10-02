export type GateMode = "lite" | "server";

export type GateInput = {
  mode: GateMode | string;
  batchId: string;
  configPath: string;
  ref?: string;
  eventName?: string;
  eventSchedule?: string;
  repositoryId?: string;
  sourceRunId?: string;
  workflowPath?: string;
  workflowRef?: string;
  issueNumber?: string;
  recordEvidence?: boolean;
  controllerReason?: string;
  gateJobName?: string;
  gateStepName?: string;
  scheduleId?: string;
  requestId?: string;
  approvalSource?: string;
  approvalRef?: string;
  requestDigest?: string;
  runAttempt?: number;
  githubToken?: string;
  repository?: string;
  actor?: string;
  expectedDispatcherActor?: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  workflowSha?: string;
};

export type GateResult = {
  result: "ALLOW" | "DENY";
  reasonCode?: string;
  message: string;
  verifiedSha?: string;
};

export type GateRepositoryRef = {
  owner: string;
  repo: string;
};

export type BatchDefinitionSnapshot = {
  gateRequired: boolean;
  enabledScheduleIds: string[];
  enabledScheduleCronById: Map<string, string>;
  status: string;
  workflowPath: string;
  workflowRef: string;
};

export type ApprovalCommand = {
  digest: string;
};

export type GateEvidence = {
  issueBody?: string;
  issueNumber?: number;
  request: ExecutionRequestEvidence | null;
  approval: ExecutionApprovalEvidence | null;
};

export type ExecutionRequestEvidence = {
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  };
  batchId: string;
  requestedBy: string;
  requestDigest: string;
  requestId: string;
  scheduleId?: string;
  schedule?: {
    repositoryId: string;
    sourceRunAttempt: number;
    sourceRunId: string;
  };
  status: string;
  triggerType?: string;
  workflowPath: string;
  workflowRef: string;
};

export type ExecutionApprovalEvidence = {
  approvalType?: string;
  approver: string;
  batchId: string;
  commandDigest: string | null;
  edited: boolean;
  requestDigest: string;
  requestId: string;
};

export type GateIssueComment = {
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ApproverSelectorSnapshot = {
  githubTeams: string[];
  githubUsers: string[];
  repositoryRoles: string[];
};
