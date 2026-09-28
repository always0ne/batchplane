import type {
  ExecutionRequest,
  RequestInventoryItem,
} from "@batchplane/ui-client";

export function approvalDisabledReason(
  request: ExecutionRequest,
  t: (key: string) => string,
) {
  if (request.capability.canApprove) return "";
  if (request.capability.approveUnavailableReason === "SELF_APPROVAL_BLOCKED") {
    return t("values.selfApprovalBlocked");
  }
  if (request.gateDecision?.allowed === false)
    return t("values.gateApprovalBlocked");
  return "";
}

export function changeRequestTypeLabel(
  changeKind: Extract<
    RequestInventoryItem,
    { kind: "CHANGE_REQUEST" }
  >["changeKind"],
  t: (key: string) => string,
) {
  let requestType = "CHANGE";
  if (changeKind.endsWith("REGISTER")) {
    requestType = "REGISTER";
  } else if (changeKind.endsWith("DELETE")) {
    requestType = "DELETE";
  }
  return t(`values.registrationRequestTypes.${requestType}`);
}
