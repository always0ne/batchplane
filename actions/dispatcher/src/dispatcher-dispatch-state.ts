import { parseDispatcherStatusEvidence } from "./dispatcher-evidence.js";
import type {
  DispatcherDispatchPlan,
  DispatcherStatus,
} from "./dispatcher-types.js";

export function findExistingDispatchState({
  comments,
  dispatchPlan,
  labels,
}: {
  comments: string[];
  dispatchPlan: Pick<
    DispatcherDispatchPlan,
    "batchId" | "requestDigest" | "requestId"
  >;
  labels: string[];
}):
  | { handled: false }
  | { handled: true; message: string; reasonCode: string } {
  const matchingStatus = comments
    .slice()
    .reverse()
    .map(parseDispatcherStatusEvidence)
    .find(
      (status) =>
        status?.requestId === dispatchPlan.requestId &&
        status.batchId === dispatchPlan.batchId &&
        status.requestDigest === dispatchPlan.requestDigest,
    );
  const status = matchingStatus?.status ?? readLabelStatus(labels);

  switch (status) {
    case "DISPATCH_FAILED":
      return {
        handled: true,
        message: "Execution request delivery failed. Create a new request.",
        reasonCode: "DISPATCH_ALREADY_HANDLED",
      };
    case "DISPATCHED":
      return {
        handled: true,
        message: "Execution request has already been dispatched.",
        reasonCode: "DISPATCH_ALREADY_HANDLED",
      };
    case "DISPATCH_UNCONFIRMED":
      return {
        handled: true,
        message:
          "Workflow acceptance is unconfirmed. The request cannot be resent.",
        reasonCode: "DISPATCH_ACCEPTANCE_UNCONFIRMED",
      };
    case "DISPATCHING":
      return {
        handled: true,
        message: "Execution request dispatch is already in progress.",
        reasonCode: "DISPATCH_IN_PROGRESS",
      };
    default:
      return { handled: false };
  }
}

function readLabelStatus(labels: string[]): DispatcherStatus | undefined {
  if (hasBatchPlaneLabel(labels, "dispatched")) return "DISPATCHED";
  if (hasBatchPlaneLabel(labels, "dispatch-failed")) return "DISPATCH_FAILED";
  if (hasBatchPlaneLabel(labels, "dispatching")) return "DISPATCHING";
  return undefined;
}

function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(`batchplane:${name}`) ||
    labels.includes(`batchtrail:${name}`)
  );
}
