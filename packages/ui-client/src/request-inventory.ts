import type { ExecutionRequest } from "./execution-requests.js";

export type GovernedChangeRequestInventory = {
  batchId: string;
  requestLocator: string;
  requester: string;
  reviewState:
    | "OPEN"
    | "APPROVED_PENDING_MERGE"
    | "MERGED"
    | "REJECTED"
    | "CLOSED";
  sourceLabel: string;
  sourceState: "OPEN" | "CLOSED";
  sourceUrl?: string;
  title: string;
  workspaceLabel: string;
};

export type RequestInventoryItem =
  | {
      actor: string;
      kind: "EXECUTION";
      request: ExecutionRequest;
      targetLabel: string;
      title: string;
      updatedAt: string;
    }
  | {
      actor: string;
      changeKind:
        | "BATCH_REGISTER"
        | "BATCH_CHANGE"
        | "BATCH_DELETE"
        | "SCHEDULE_REGISTER"
        | "SCHEDULE_CHANGE";
      kind: "GOVERNED_CHANGE";
      request: GovernedChangeRequestInventory;
      targetLabel: string;
      title: string;
      updatedAt: string;
    };

export type ApprovalRequestInventory = {
  requests: RequestInventoryItem[];
  workspaceDefaultBranch: string;
};

export type WorkspaceRequestInventory = {
  requests: RequestInventoryItem[];
};

export type MyWorkInventory = {
  currentUser: string;
  items: MyWorkItem[];
};

export type MyWorkItem =
  | {
      itemType: "REQUESTED_BY_YOU" | "AWAITING_YOUR_DECISION";
      occurredAt: string;
      priority: "HIGH" | "NORMAL";
      request: RequestInventoryItem;
    }
  | {
      action:
        | "WRITE_FOLLOW_UP"
        | "CONTINUE_FOLLOW_UP"
        | "UPDATE_FOLLOW_UP"
        | "REVIEW_FOLLOW_UP"
        | "REVIEW_GATE_EVIDENCE";
      actor: string;
      attemptLocator: string;
      batchId: string;
      itemType: "FAILURE_FOLLOW_UP";
      /** Stable product identity for this actionable follow-up item. */
      itemLocator: string;
      isGateBlocked: boolean;
      occurredAt: string;
      priority: "HIGH" | "NORMAL";
      requestId: string;
      revisionReason?: "CHANGES_REQUESTED" | "REJECTED";
      sourceLabel: string;
      sourceUrl?: string;
      title: string;
    };
