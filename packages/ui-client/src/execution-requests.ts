import type {
  ExecutionRequestPayload,
  ExecutionRequestStatus,
  ExecutionRunJob,
  ExecutionRunStatus,
  RunnerLabel,
  WorkspaceApprovalMode,
} from "@batchplane/domain";

export type ExecutionRequestParameter = {
  name: string;
  sensitive: boolean;
  value: string;
};

export type ExecutionRequestBatchContext = {
  batchId: string;
  criticality: string;
  domain: string;
  environment: string;
  execution?: {
    artifactPath?: string;
    command: string;
    runsOn: RunnerLabel;
  };
  gateRequired: boolean;
  name: string;
  owner: string;
  status: "ACTIVE" | "INACTIVE";
  workflowPath: string;
  workflowRef: string;
};

export type ExecutionRequestDraft = {
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  };
  batch: ExecutionRequestBatchContext;
  creationCapability: {
    canCreate: boolean;
    unavailableReasons: Array<
      "BATCH_INACTIVE" | "EXECUTION_COMMAND_UNAVAILABLE" | "GATE_NOT_REQUIRED"
    >;
  };
  requestId: string;
  requestedAt: string;
  requestedBy: string;
  workspaceApprovalMode: WorkspaceApprovalMode;
  workspaceLabel: string;
};

export type ExecutionRequestDraftResult =
  | { batchId: string; type: "not-found" }
  | { draft: ExecutionRequestDraft; type: "ready" };

export type ExecutionRequestInput = {
  draft: ExecutionRequestDraft;
  expiresAt: string;
  parameters: ExecutionRequestParameter[];
  reason: string;
  workflowRef: string;
};

export class ExecutionRequestCreationUnavailableError extends Error {
  readonly code = "EXECUTION_REQUEST_CREATION_UNAVAILABLE";

  constructor(
    readonly unavailableReasons: ExecutionRequestDraft["creationCapability"]["unavailableReasons"],
  ) {
    super("EXECUTION_REQUEST_CREATION_UNAVAILABLE");
    this.name = "ExecutionRequestCreationUnavailableError";
  }
}

export function isExecutionRequestCreationUnavailableError(
  error: unknown,
): error is ExecutionRequestCreationUnavailableError {
  return error instanceof ExecutionRequestCreationUnavailableError;
}

export type ExecutionRequestEvidence = {
  /** The canonical request evidence is intentionally opaque to product UI. */
  canonicalPayload: string | null;
  requestDigest: string;
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  } | null;
};

export type ExecutionDecision = {
  actor: string;
  decidedAt: string;
  decision: "APPROVED" | "REJECTED";
  reason: string;
  source: "WORKSPACE_POLICY" | "USER";
};

export type ExecutionDispatch = {
  actor: string;
  createdAt: string;
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
};

export type ExecutionGateDecision = {
  actor: string;
  allowed: boolean;
  createdAt: string;
  message?: string;
  reasonCode?: string;
};

export type ExecutionAttempt = {
  actor?: string;
  attempt: number;
  /** Stable BatchPlane attempt identity; routes may use it without provider IDs. */
  attemptLocator: string;
  completedAt?: string;
  gateDecision?: {
    allowed: boolean;
    decidedAt: string;
    message: string;
    reasonCode?: string;
  };
  jobs?: ExecutionRunJob[];
  requestId: string;
  sourceLabel: string;
  sourceUrl?: string;
  startedAt?: string;
  status: ExecutionRunStatus;
  workflow: {
    name?: string;
    path?: string;
  };
};

export type ExecutionAttempts =
  | { type: "loaded"; attempts: ExecutionAttempt[] }
  | { type: "unavailable" };

export type ExecutionRequestCapability = {
  canApprove: boolean;
  canReject: boolean;
  approveUnavailableReason?: "NOT_AWAITING_APPROVAL" | "SELF_APPROVAL_BLOCKED";
  rejectUnavailableReason?: "NOT_AWAITING_APPROVAL";
};

export type ExecutionRequestApprovalNotice = {
  kind: "SELF_APPROVAL_ALLOWED";
  mode: "SELF_APPROVAL_ALLOWED" | "AUTO_APPROVE";
};

export type ExecutionRequest = {
  approvalDecision?: ExecutionDecision;
  approvalNotice?: ExecutionRequestApprovalNotice;
  batch: {
    criticality: string;
    domain: string;
    environment: string;
    name: string;
    owner: string;
  };
  batchId: string;
  capability: ExecutionRequestCapability;
  dispatcher?: ExecutionDispatch;
  evidence: ExecutionRequestEvidence;
  execution?: {
    artifactPath?: string;
    command: string;
    gateRequired: boolean;
    runsOn: RunnerLabel;
  };
  expiresAt: string;
  gateDecision?: ExecutionGateDecision;
  reason: string;
  requestId: string;
  requestLocator: string;
  requestedAt: string;
  requestedBy: string;
  sourceLabel: string;
  sourceState: "OPEN" | "CLOSED";
  sourceUrl?: string;
  status: ExecutionRequestStatus | "GATE_BLOCKED";
  title: string;
  triggerType: "MANUAL" | "SCHEDULE";
  updatedAt: string;
  workspaceLabel: string;
  attempts: ExecutionAttempts;
  schedule?: NonNullable<ExecutionRequestPayload["spec"]["schedule"]>;
  workflow?: {
    path: string;
    ref: string;
  };
};

export type ExecutionRequestPreview = {
  request: Omit<
    ExecutionRequest,
    "attempts" | "capability" | "requestLocator" | "sourceLabel" | "sourceUrl"
  >;
};

export type CreateExecutionRequestResult = {
  postCreateError?: {
    code: "AUTO_APPROVAL_RECORDING_FAILED";
  };
  request: ExecutionRequest;
};
