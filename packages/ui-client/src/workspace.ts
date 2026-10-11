import type { WorkspacePolicy } from "@batchplane/domain";
import type { BatchListError } from "./batches.js";

export type {
  WorkspaceApprovalMode,
  WorkspacePolicy,
} from "@batchplane/domain";

export type WorkspaceConnection = {
  label: string;
  currentUser: string;
  defaultRevision: string;
};

export type WorkspaceInstallation = {
  availableRequest: "INSTALL" | "UPDATE" | null;
  installed: boolean;
  requiredEvidence: string[];
  presentEvidence: string[];
  missingEvidence: string[];
  outdatedEvidence: string[];
};

export type WorkspaceInspection = {
  connection: WorkspaceConnection;
  installation: WorkspaceInstallation;
  policy: WorkspacePolicy;
};

export type WorkspaceChangeRequest = {
  label: string;
  sourceUrl: string;
};

export type WorkspaceEncryptionStatus = {
  state:
    | "NOT_CONFIGURED"
    | "PENDING_APPROVAL"
    | "SETUP_RECORDED"
    | "INCOMPLETE"
    | "STATUS_UNAVAILABLE"
    | "INVALID_CONFIGURATION";
  keyId?: string;
  configurationPublished: boolean;
  privateKeyStored: "PRESENT" | "ABSENT" | "UNKNOWN";
  canInitialize: boolean;
  canRetryUpload: boolean;
  request?: WorkspaceChangeRequest;
};

export type WorkspaceEncryptionUnavailableReason =
  | "NOT_CONFIGURED"
  | "KEY_NOT_REGISTERED"
  | "STATUS_UNAVAILABLE"
  | "INVALID_CONFIGURATION";

export type WorkspaceEncryptionSetupResult = {
  status: WorkspaceEncryptionStatus;
  upload: "RECORDED" | "FAILED" | "NOT_ATTEMPTED";
  error?: BatchListError;
  failureStage?: "STATUS_CHECK" | "PRIVATE_KEY_UPLOAD";
};

export type WorkspaceInstallationRequest = {
  request: WorkspaceChangeRequest;
  installation: WorkspaceInstallation;
};

export type WorkspacePolicyRequest = {
  request: WorkspaceChangeRequest;
  currentPolicy: WorkspacePolicy;
  requestedPolicy: WorkspacePolicy;
};

export class WorkspaceSettingsError extends Error {
  constructor(readonly reason: BatchListError) {
    super(reason.type === "message" ? reason.message : reason.type);
    this.name = "WorkspaceSettingsError";
  }
}
