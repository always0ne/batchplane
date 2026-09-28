import type { RequestInventoryItem } from "@batchplane/ui-client";

export type RequestKindFilter = "all" | "change-request" | "execution";
export const statusFilters = [
  "all",
  "OPEN",
  "APPROVED_PENDING_MERGE",
  "MERGED",
  "REJECTED",
  "CLOSED",
  "SCHEDULE_RECORDED",
  "REQUESTED",
  "APPROVED",
  "DISPATCHING",
  "DISPATCHED",
  "DISPATCH_FAILED",
  "GATE_BLOCKED",
] as const;
export type RequestStatusFilter = (typeof statusFilters)[number];

export function matchesRequestFilters(
  item: RequestInventoryItem,
  {
    kindFilter,
    query,
    statusFilter,
  }: {
    kindFilter: RequestKindFilter;
    query: string;
    statusFilter: RequestStatusFilter;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  const kind = item.kind === "CHANGE_REQUEST" ? "change-request" : "execution";
  const status = requestStatus(item);

  return (
    (kindFilter === "all" || kindFilter === kind) &&
    (statusFilter === "all" || statusFilter === status) &&
    (!normalizedQuery ||
      [item.title, item.targetLabel, item.actor, item.request.sourceLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery))
  );
}

export function countRequests(items: RequestInventoryItem[]) {
  return {
    execution: items.filter((item) => item.kind === "EXECUTION").length,
    changeRequest: items.filter((item) => item.kind === "CHANGE_REQUEST")
      .length,
  };
}

export function detailRoute(item: RequestInventoryItem) {
  const requestLocator = encodeURIComponent(item.request.requestLocator);
  return item.kind === "CHANGE_REQUEST"
    ? `/approvals/registration/${requestLocator}`
    : `/execution-requests/${requestLocator}`;
}

export function requestKey(item: RequestInventoryItem) {
  return `${item.kind}-${item.request.requestLocator}`;
}

export function requestStatus(item: RequestInventoryItem) {
  if (item.kind === "CHANGE_REQUEST") return item.request.reviewState;
  if (item.request.triggerType === "SCHEDULE") return "SCHEDULE_RECORDED";
  return item.request.status;
}

export function requestTypeLabel(
  item: RequestInventoryItem,
  t: (key: string) => string,
) {
  if (item.kind === "EXECUTION") {
    return t(
      `types.${item.request.triggerType === "SCHEDULE" ? "scheduledExecution" : "manualExecution"}`,
    );
  }

  const typeKey = {
    BATCH_CHANGE: "batchChange",
    BATCH_DELETE: "batchDelete",
    BATCH_REGISTER: "batchRegister",
    SCHEDULE_CHANGE: "scheduleChange",
    SCHEDULE_REGISTER: "scheduleChange",
  }[item.changeKind];

  return t(`types.${typeKey}`);
}

export function statusLabel(status: string, t: (key: string) => string) {
  if (status === "all") return t("filters.statuses.all");
  const requestLabel = t(`statuses.${status}`);
  return requestLabel === `statuses.${status}`
    ? t(`approvals:registrationDetail.review.states.${status}`)
    : requestLabel;
}

export function statusClassName(status: string) {
  if (status === "SCHEDULE_RECORDED") {
    return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
  }
  if (
    status === "REJECTED" ||
    status === "DISPATCH_FAILED" ||
    status === "GATE_BLOCKED"
  ) {
    return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  }
  if (status === "REQUESTED" || status === "OPEN") {
    return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800";
  }
  return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700";
}

export function formatRequestTime(value: string, fallback: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return fallback;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
