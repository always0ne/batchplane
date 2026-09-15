export {
  buildExecutionApprovalComment,
  buildExecutionRequestIssue,
  createExecutionRequestId,
  createScheduledExecutionRequestId,
  type ExecutionRequestIssue,
  type ExecutionRequestParameterInput,
  type ExecutionRequestPayload,
} from "@batchplane/github-lite";

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
