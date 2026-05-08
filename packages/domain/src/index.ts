export type BatchStatus = "ACTIVE" | "INACTIVE";

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BatchDefinition = {
  batchId: string;
  name: string;
  owner: string;
  domain: string;
  environment: string;
  criticality: Criticality;
  status: BatchStatus;
  workflow: {
    path: string;
    ref: string;
  };
  gateRequired: boolean;
};

export type ExecutionRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "DISPATCHING"
  | "DISPATCHED"
  | "DISPATCH_FAILED";

export type ExecutionRequest = {
  requestId: string;
  batchId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  requestDigest: string;
  status: ExecutionRequestStatus;
};

export type RuntimeMode = "mock" | "github-lite" | "server-api";
