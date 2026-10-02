import { dispatchApprovedExecutionRequest } from "./dispatcher-dispatch-use-case.js";
import { runDispatcherFromEnvironment } from "./dispatcher-runtime.js";

export { parseDispatcherCommand } from "./dispatcher-command.js";
export {
  isActionableApprovalComment,
  parseDispatcherStatusEvidence,
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
  verifyDispatcherEvidence,
} from "./dispatcher-evidence.js";
export { dispatchApprovedExecutionRequest } from "./dispatcher-dispatch-use-case.js";
export type {
  DispatcherCommand,
  DispatcherDispatchPlan,
  DispatcherRunInput,
  DispatcherRunResult,
  DispatcherStatus,
  DispatcherStatusEvidence,
  DispatcherVerificationInput,
  DispatcherVerificationResult,
  ExecutionApprovalEvidence,
  ExecutionRequestEvidence,
} from "./dispatcher-types.js";

if (
  process.env["GITHUB_ACTIONS"] === "true" &&
  process.env["BATCHTRAIL_DISPATCHER_DISABLE_AUTO_RUN"] !== "true"
) {
  void runDispatcherFromEnvironment(dispatchApprovedExecutionRequest).catch(
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
