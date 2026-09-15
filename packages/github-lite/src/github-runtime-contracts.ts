import type {
  AuditTimelineItem,
  ExecutionRun,
  ExecutionRunJobLog,
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
  WorkspacePolicy,
} from "@batchplane/domain";

import type { GitHubBatchDefinition } from "./github-batch-definition.js";

export type RuntimeMode = "mock" | "github-lite" | "server-api";

export type ApprovedBatchRevision = {
  governedChangeId: string;
  targetRevisionDigest: string;
  verifiedSha: string;
};

/** Active GitHub Lite runtime contracts. R7-2 removes their legacy consumers. */
export type RepositoryRef = { owner: string; repo: string };
export type RepositoryUser = { login: string };
export type Repository = RepositoryRef & {
  defaultBranch: string;
  private: boolean;
  url: string;
};
export type RepositoryIssueState = "open" | "closed" | "all";
export type RepositoryIssue = {
  author: string;
  body: string;
  createdAt?: string;
  isPullRequest: boolean;
  labels: string[];
  number: number;
  state: Exclude<RepositoryIssueState, "all">;
  title: string;
  updatedAt?: string;
  url: string;
};
export type RepositoryIssueComment = {
  author: string;
  body: string;
  createdAt: string;
  id: number;
  issueNumber: number;
};
export type RepositoryPullRequestState = "open" | "closed" | "all";
export type RepositoryPullRequest = {
  author: string;
  base: string;
  body: string;
  createdAt?: string;
  head: string;
  merged: boolean;
  number: number;
  state: Exclude<RepositoryPullRequestState, "all">;
  title: string;
  updatedAt?: string;
  url: string;
};
export type RepositoryMergeResult = {
  merged: boolean;
  message: string;
  sha: string;
};
export type RepositoryFile = { content: string; path: string; ref: string };
export type RepositoryPullRequestFile = {
  patch?: string;
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "unchanged";
};
export type RuntimeInstallationStatus = {
  installed: boolean;
  missingPaths: string[];
  outdatedPaths?: string[];
  presentPaths: string[];
  requiredPaths: string[];
};
export type RuntimeInstallationPullRequestResult = {
  pullRequest: RepositoryPullRequest;
  status: RuntimeInstallationStatus;
};
export type RegistrationArtifactInput = {
  content: string;
  encoding?: "utf-8" | "base64";
  path: string;
};
export type RegistrationTargetStatus = {
  batchDefinitionExists: boolean;
  workflowExists: boolean;
};
export type GovernedChangeFilePreviewStatus =
  | "ADDED"
  | "MODIFIED"
  | "DELETED"
  | "UNCHANGED";
export type GovernedChangeFilePreviewInput = {
  content: string | null;
  path: string;
};
export type GovernedChangeFilePreview = {
  baseContent: string;
  nextContent: string;
  path: string;
  status: GovernedChangeFilePreviewStatus;
};
export type PreviewGovernedChangeFilesInput = {
  baseBranch: string;
  files: GovernedChangeFilePreviewInput[];
};
export type CreateRegistrationPullRequestInput = {
  artifact?: RegistrationArtifactInput;
  baseBranch: string;
  batchDefinitionPath: string;
  batchDefinitionYaml: string;
  body: string;
  branch: string;
  title: string;
  workflowPath: string;
  workflowYaml: string;
};
export type CreateBatchDeletionPullRequestInput = {
  artifactPath?: string;
  baseBranch: string;
  batchDefinitionPath: string;
  body: string;
  branch: string;
  title: string;
  workflowPath: string;
};
export type DeletedBatchArchiveUnavailableReason =
  | "LEGACY_OR_MALFORMED_EVIDENCE"
  | "REQUEST_EVIDENCE_MISMATCH"
  | "REQUEST_EVIDENCE_UNVERIFIED"
  | "BASE_REVISION_UNAVAILABLE"
  | "BATCH_DEFINITION_NOT_FOUND"
  | "BATCH_DEFINITION_DIGEST_MISMATCH"
  | "BATCH_DEFINITION_MALFORMED";

export type DeletedBatchArchiveResult =
  | {
      batch: GitHubBatchDefinition;
      sourceRequest: { locator: string; number?: number; url: string };
      status: "VERIFIED";
    }
  | {
      sourceRequest: { locator: string; number?: number; url: string };
      status: "UNAVAILABLE";
      unavailableReason: DeletedBatchArchiveUnavailableReason;
    };

/** GitHub-only execution evidence used by the active Lite runtime ports. */
export type GitHubExecutionRun = ExecutionRun & {
  failureFollowUps?: FailureFollowUp[];
  requestIssueNumber?: number;
  requestIssueUrl?: string;
  workflowName?: string;
  workflowPath?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
};

export type BatchPort = {
  getDeletedBatchArchive(params: {
    batchId: string;
    ref?: string;
  }): Promise<DeletedBatchArchiveResult | null>;
  listBatchDefinitions(params: {
    ref: string;
  }): Promise<GitHubBatchDefinition[]>;
};
export type RegistrationPort = {
  checkRegistrationTargets(params: {
    baseBranch: string;
    batchDefinitionPath: string;
    workflowPath: string;
  }): Promise<RegistrationTargetStatus>;
  previewGovernedChangeFiles(
    params: PreviewGovernedChangeFilesInput,
  ): Promise<GovernedChangeFilePreview[]>;
  createRegistrationPullRequest(
    params: CreateRegistrationPullRequestInput,
  ): Promise<RepositoryPullRequest>;
  createBatchDeletionPullRequest(
    params: CreateBatchDeletionPullRequestInput,
  ): Promise<RepositoryPullRequest>;
};
export type ExecutionPort = {
  createFailureFollowUp(params: {
    actionTaken: string;
    explanation: string;
    owner: string;
    runId: string;
    status: FailureFollowUpStatus;
  }): Promise<FailureFollowUp>;
  reviewFailureFollowUp(params: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
    runId: string;
  }): Promise<FailureFollowUpReviewDecision>;
  createExecutionRequest(params: {
    body: string;
    labels: string[];
    title: string;
  }): Promise<RepositoryIssue>;
  getApprovedBatchRevision(params: {
    batchId: string;
  }): Promise<ApprovedBatchRevision>;
  getExecutionRun(params: {
    runAttempt?: number;
    runId: string;
  }): Promise<GitHubExecutionRun | null>;
  getExecutionRunJobLog(params: { jobId: string }): Promise<ExecutionRunJobLog>;
  listExecutionRuns(params?: {
    batchId?: string;
    limit?: number;
    requestId?: string;
    workflowPath?: string;
  }): Promise<GitHubExecutionRun[]>;
};
export type ApprovalPort = {
  getRegistrationRequest(params: {
    pullNumber: number;
  }): Promise<RepositoryPullRequest | null>;
  listRegistrationRequests(params: {
    baseBranch: string;
    state?: RepositoryPullRequestState;
  }): Promise<RepositoryPullRequest[]>;
  listRegistrationRequestFiles(params: {
    pullNumber: number;
  }): Promise<RepositoryPullRequestFile[]>;
  readRegistrationRequestFile(params: {
    path: string;
    ref: string;
  }): Promise<RepositoryFile | null>;
  listExecutionRequestIssues(params?: {
    state?: RepositoryIssueState;
  }): Promise<RepositoryIssue[]>;
  getExecutionRequestIssue(params: {
    issueNumber: number;
  }): Promise<RepositoryIssue | null>;
  listExecutionRequestComments(params: {
    issueNumber: number;
  }): Promise<RepositoryIssueComment[]>;
  approveRegistration(params: {
    body: string;
    commitTitle: string;
    pullNumber: number;
  }): Promise<RepositoryMergeResult>;
  rejectRegistration(params: {
    body: string;
    pullNumber: number;
  }): Promise<void>;
  approveExecution(params: {
    body: string;
    issueNumber: number;
  }): Promise<RepositoryIssueComment>;
  rejectExecution(params: { body: string; issueNumber: number }): Promise<void>;
};
export type AuditPort = {
  listAuditTimeline(params?: { limit?: number }): Promise<AuditTimelineItem[]>;
};
export type SettingsPort = {
  getCurrentUser(): Promise<RepositoryUser>;
  getRepository(): Promise<Repository>;
  getWorkspacePolicy(params?: { ref?: string }): Promise<WorkspacePolicy>;
  checkInstallationStatus(params: {
    ref: string;
  }): Promise<RuntimeInstallationStatus>;
  createInstallationPullRequest(params: {
    defaultBranch: string;
  }): Promise<RuntimeInstallationPullRequestResult>;
  createInstallationUpdatePullRequest(params: {
    defaultBranch: string;
  }): Promise<RuntimeInstallationPullRequestResult>;
  createWorkspacePolicyPullRequest(params: {
    defaultBranch: string;
    policy: WorkspacePolicy;
  }): Promise<RepositoryPullRequest>;
};
export type BatchPlaneRuntimePorts = {
  approvals: ApprovalPort;
  audit: AuditPort;
  batches: BatchPort;
  executions: ExecutionPort;
  registration: RegistrationPort;
  settings: SettingsPort;
};
