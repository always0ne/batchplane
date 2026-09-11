// R5 callers keep this import path while GitHub-specific parsing lives in the adapter.
export {
  deriveRegistrationFilePaths,
  deriveRegistrationReviewState,
  isOpenRegistrationReview,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "@batchplane/github-lite";

export type {
  BatchRegistrationRequestBodySummary,
  BatchRegistrationRequestType,
  RegistrationApprovalDecision,
  RegistrationRequestBodySummary,
  RegistrationReviewState,
  ScheduleRegistrationRequestBodySummary,
} from "@batchplane/github-lite";
