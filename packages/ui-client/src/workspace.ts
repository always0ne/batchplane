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
