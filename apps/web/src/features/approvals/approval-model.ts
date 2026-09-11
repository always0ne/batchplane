// R5 callers keep this import path while GitHub-specific parsing lives in the adapter.
export {
  allowsSelfApproval,
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  getGovernedChangeRequestKind,
  isAutoApprovalEnabled,
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
  parseExecutionRequestDetail,
} from "@batchplane/github-lite";

export type {
  ExecutionApprovalDecision,
  ExecutionApprovalRequest,
  ExecutionDispatcherStatus,
  ExecutionGateDecision,
  ExecutionRequestDisplayStatus,
  GovernedChangeRequestKind,
} from "@batchplane/github-lite";
