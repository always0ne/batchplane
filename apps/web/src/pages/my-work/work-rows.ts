import type { MyWorkItem, RequestInventoryItem } from "@batchplane/ui-client";

export type WorkKind =
  | "approval"
  | "failureFollowUp"
  | "registration"
  | "request";

export type WorkRow = {
  actionKey:
    | "continueFollowUp"
    | "reviewApproval"
    | "reviewFollowUp"
    | "reviewGateEvidence"
    | "updateFollowUp"
    | "viewRegistration"
    | "viewRequest"
    | "writeFollowUp";
  actor: string;
  descriptionKey:
    | "executionApproval"
    | "executionMine"
    | "failureMissing"
    | "failureChangesRequested"
    | "failureRejected"
    | "failureOngoing"
    | "failureReview"
    | "gateBlockedAssigned"
    | "gateBlockedMine"
    | "registrationMine"
    | "registrationReview"
    | "scheduleMine"
    | "scheduleReview";
  itemId: string;
  kind: WorkKind;
  labelKey: string;
  occurredAt: string;
  priority: "high" | "normal";
  title: string;
  to: string;
};

export const workKinds: WorkKind[] = [
  "approval",
  "registration",
  "request",
  "failureFollowUp",
];

export function toWorkRow(item: MyWorkItem): WorkRow {
  if (item.itemType === "FAILURE_FOLLOW_UP") {
    return failureFollowUpRow(item);
  }

  return requestWorkRow(item);
}

type RequestWorkItem = Extract<
  MyWorkItem,
  { itemType: "REQUESTED_BY_YOU" | "AWAITING_YOUR_DECISION" }
>;

function requestWorkRow(item: RequestWorkItem): WorkRow {
  const requestItem = item.request;

  if (requestItem.kind === "EXECUTION") {
    return executionRequestWorkRow(item, requestItem);
  }

  return changeRequestWorkRow(item, requestItem);
}

function executionRequestWorkRow(
  item: RequestWorkItem,
  requestItem: Extract<RequestInventoryItem, { kind: "EXECUTION" }>,
): WorkRow {
  const isApproval = item.itemType === "AWAITING_YOUR_DECISION";
  const request = requestItem.request;

  return {
    actionKey: isApproval ? "reviewApproval" : "viewRequest",
    actor: requestItem.actor,
    descriptionKey: isApproval ? "executionApproval" : "executionMine",
    itemId: `${item.itemType}-${requestItem.kind}-${request.requestLocator}`,
    kind: isApproval ? "approval" : "request",
    labelKey: isApproval ? "executionApproval" : "request",
    occurredAt: item.occurredAt,
    priority: item.priority === "HIGH" ? "high" : "normal",
    title: `${request.batchId} - ${request.requestId}`,
    to: `/execution-requests/${encodeURIComponent(request.requestLocator)}`,
  };
}

function changeRequestWorkRow(
  item: RequestWorkItem,
  requestItem: Extract<RequestInventoryItem, { kind: "CHANGE_REQUEST" }>,
): WorkRow {
  const { request } = requestItem;
  const display = changeRequestDisplay(item, requestItem);

  return {
    ...display,
    actor: requestItem.actor,
    itemId: `${item.itemType}-${requestItem.kind}-${request.requestLocator}`,
    occurredAt: item.occurredAt,
    priority: item.priority === "HIGH" ? "high" : "normal",
    title: `${request.sourceLabel} ${request.title}`,
    to: `/approvals/registration/${encodeURIComponent(request.requestLocator)}`,
  };
}

type ChangeRequestDisplay = Pick<
  WorkRow,
  "actionKey" | "descriptionKey" | "kind" | "labelKey"
>;

function changeRequestDisplay(
  item: RequestWorkItem,
  requestItem: Extract<RequestInventoryItem, { kind: "CHANGE_REQUEST" }>,
): ChangeRequestDisplay {
  const isSchedule = requestItem.changeKind.startsWith("SCHEDULE");

  if (item.itemType === "AWAITING_YOUR_DECISION") {
    if (isSchedule) {
      return {
        actionKey: "reviewApproval",
        descriptionKey: "scheduleReview",
        kind: "approval",
        labelKey: "scheduleApproval",
      };
    }

    return {
      actionKey: "reviewApproval",
      descriptionKey: "registrationReview",
      kind: "approval",
      labelKey: "registrationApproval",
    };
  }

  if (isSchedule) {
    return {
      actionKey: "viewRegistration",
      descriptionKey: "scheduleMine",
      kind: "registration",
      labelKey: "schedule",
    };
  }

  return {
    actionKey: "viewRegistration",
    descriptionKey: "registrationMine",
    kind: "registration",
    labelKey: "registration",
  };
}

function failureFollowUpRow(
  item: Extract<MyWorkItem, { itemType: "FAILURE_FOLLOW_UP" }>,
): WorkRow {
  const mapping = {
    CONTINUE_FOLLOW_UP: {
      actionKey: "continueFollowUp" as const,
      descriptionKey: item.isGateBlocked
        ? ("gateBlockedAssigned" as const)
        : ("failureOngoing" as const),
      labelKey: item.isGateBlocked ? "gateBlocked" : "failureFollowUp",
    },
    REVIEW_FOLLOW_UP: {
      actionKey: "reviewFollowUp" as const,
      descriptionKey: "failureReview" as const,
      labelKey: "failureReview",
    },
    REVIEW_GATE_EVIDENCE: {
      actionKey: "reviewGateEvidence" as const,
      descriptionKey: "gateBlockedMine" as const,
      labelKey: "gateBlocked",
    },
    UPDATE_FOLLOW_UP: {
      actionKey: "updateFollowUp" as const,
      descriptionKey:
        item.revisionReason === "REJECTED"
          ? ("failureRejected" as const)
          : ("failureChangesRequested" as const),
      labelKey: item.isGateBlocked ? "gateBlocked" : "failureFollowUp",
    },
    WRITE_FOLLOW_UP: {
      actionKey: "writeFollowUp" as const,
      descriptionKey: "failureMissing" as const,
      labelKey: "failureFollowUp",
    },
  }[item.action];

  return {
    ...mapping,
    actor: item.actor,
    itemId: item.itemLocator,
    kind: "failureFollowUp",
    occurredAt: item.occurredAt,
    priority: item.priority === "HIGH" ? "high" : "normal",
    title: item.title,
    to:
      item.action === "REVIEW_GATE_EVIDENCE"
        ? `/executions/${encodeURIComponent(item.attemptLocator)}`
        : `/executions/${encodeURIComponent(item.attemptLocator)}#failure-follow-up`,
  };
}

export function countWorkItems(items: WorkRow[]): Record<WorkKind, number> {
  return {
    approval: items.filter((item) => item.kind === "approval").length,
    failureFollowUp: items.filter((item) => item.kind === "failureFollowUp")
      .length,
    registration: items.filter((item) => item.kind === "registration").length,
    request: items.filter((item) => item.kind === "request").length,
  };
}

export function compareWorkItems(left: WorkRow, right: WorkRow) {
  if (left.priority !== right.priority) {
    return left.priority === "high" ? -1 : 1;
  }

  return workTimestamp(right.occurredAt) - workTimestamp(left.occurredAt);
}

function workTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function formatWorkTime(value: string, fallback: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleString()
    : fallback;
}
