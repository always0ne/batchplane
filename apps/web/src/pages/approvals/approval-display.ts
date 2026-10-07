import type {
  ExecutionRequest,
  RequestInventoryItem,
} from "@batchplane/ui-client";

export function approvalDisabledReason(
  request: ExecutionRequest,
  t: (key: string) => string,
) {
  if (request.capability.canApprove) return "";
  if (request.capability.approveUnavailableReason === "APPROVER_ROLE_REQUIRED")
    return t("values.approverRoleRequired");
  if (
    request.capability.approveUnavailableReason === "AUTHORIZATION_UNAVAILABLE"
  )
    return t("values.authorizationUnavailable");
  if (
    request.capability.approveUnavailableReason ===
    "REQUESTER_IDENTITY_UNVERIFIED"
  ) {
    return t("values.requesterIdentityUnverified");
  }
  if (request.capability.approveUnavailableReason === "SELF_APPROVAL_BLOCKED") {
    return t("values.selfApprovalBlocked");
  }
  if (request.gateDecision?.allowed === false)
    return t("values.gateApprovalBlocked");
  return "";
}

export function rejectionDisabledReason(
  request: ExecutionRequest,
  t: (key: string) => string,
) {
  if (request.capability.canReject) return "";
  if (request.capability.rejectUnavailableReason === "APPROVER_ROLE_REQUIRED")
    return t("values.approverRoleRequired");
  if (
    request.capability.rejectUnavailableReason === "AUTHORIZATION_UNAVAILABLE"
  )
    return t("values.authorizationUnavailable");
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
