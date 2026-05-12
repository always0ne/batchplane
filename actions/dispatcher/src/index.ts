export type DispatcherCommand = "approve" | "retry-dispatch" | "ignore";

export type ExecutionRequestEvidence = {
  batchId: string;
  expiresAt: string;
  requestDigest: string;
  requestedAt: string;
  requestedBy: string;
  requestId: string;
  status: string;
  workflowPath: string;
  workflowRef: string;
};

export type ExecutionApprovalEvidence = {
  batchId: string;
  decision: "APPROVED" | "REJECTED";
  requestDigest: string;
  requestId: string;
};

export type DispatcherVerificationInput = {
  approvalCommentBody: string;
  issueBody: string;
  now?: Date;
};

export type DispatcherDispatchPlan = {
  batchId: string;
  requestDigest: string;
  requestId: string;
  workflowPath: string;
  workflowRef: string;
  workflowInputs: Record<string, string>;
};

export type DispatcherVerificationResult =
  | {
      ok: true;
      approval: ExecutionApprovalEvidence;
      dispatchPlan: DispatcherDispatchPlan;
      request: ExecutionRequestEvidence;
    }
  | {
      ok: false;
      message: string;
      reasonCode:
        | "APPROVAL_NOT_APPROVED"
        | "APPROVAL_NOT_FOUND"
        | "DIGEST_MISMATCH"
        | "EXPIRED_REQUEST"
        | "REQUEST_FIELD_MISMATCH"
        | "REQUEST_NOT_FOUND"
        | "REQUEST_NOT_REQUESTED"
        | "WORKFLOW_NOT_FOUND";
    };

export function parseDispatcherCommand(commentBody: string): DispatcherCommand {
  if (commentBody.startsWith("/bgcp approve ")) {
    return "approve";
  }

  if (commentBody.startsWith("/bgcp retry-dispatch ")) {
    return "retry-dispatch";
  }

  return "ignore";
}

export function verifyDispatcherEvidence({
  approvalCommentBody,
  issueBody,
  now = new Date(),
}: DispatcherVerificationInput): DispatcherVerificationResult {
  const request = parseExecutionRequestEvidence(issueBody);

  if (!request) {
    return {
      ok: false,
      message: "BatchTrail execution request evidence was not found.",
      reasonCode: "REQUEST_NOT_FOUND",
    };
  }

  if (request.status !== "REQUESTED") {
    return {
      ok: false,
      message: `Execution request status is ${request.status}.`,
      reasonCode: "REQUEST_NOT_REQUESTED",
    };
  }

  if (isExpired(request.expiresAt, now)) {
    return {
      ok: false,
      message: "Execution request approval window has expired.",
      reasonCode: "EXPIRED_REQUEST",
    };
  }

  if (!request.workflowPath || !request.workflowRef) {
    return {
      ok: false,
      message: "Execution request workflow target was not found.",
      reasonCode: "WORKFLOW_NOT_FOUND",
    };
  }

  const approval = parseExecutionApprovalEvidence(approvalCommentBody);

  if (!approval) {
    return {
      ok: false,
      message: "BatchTrail execution approval evidence was not found.",
      reasonCode: "APPROVAL_NOT_FOUND",
    };
  }

  if (approval.decision !== "APPROVED") {
    return {
      ok: false,
      message: `Execution approval decision is ${approval.decision}.`,
      reasonCode: "APPROVAL_NOT_APPROVED",
    };
  }

  if (
    approval.requestId !== request.requestId ||
    approval.batchId !== request.batchId
  ) {
    return {
      ok: false,
      message: "Execution approval does not reference the requested batch.",
      reasonCode: "REQUEST_FIELD_MISMATCH",
    };
  }

  if (approval.requestDigest !== request.requestDigest) {
    return {
      ok: false,
      message: "Execution approval digest does not match the request digest.",
      reasonCode: "DIGEST_MISMATCH",
    };
  }

  return {
    ok: true,
    approval,
    dispatchPlan: {
      batchId: request.batchId,
      requestDigest: request.requestDigest,
      requestId: request.requestId,
      workflowInputs: {
        batch_id: request.batchId,
        request_digest: request.requestDigest,
        request_id: request.requestId,
      },
      workflowPath: request.workflowPath,
      workflowRef: request.workflowRef,
    },
    request,
  };
}

export function parseExecutionRequestEvidence(
  issueBody: string,
): ExecutionRequestEvidence | null {
  const marker = parseBatchTrailMarker(issueBody, "execution-request");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
  const payload = parseCanonicalPayload(issueBody);
  const workflow = readWorkflowTarget(payload);

  if (!requestId || !batchId || !requestDigest || !status) {
    return null;
  }

  return {
    batchId,
    expiresAt: readMarkdownField(issueBody, "Expires at"),
    requestDigest,
    requestedAt: readMarkdownField(issueBody, "Requested at"),
    requestedBy: readMarkdownField(issueBody, "Requested by").replace(/^@/, ""),
    requestId,
    status,
    workflowPath: workflow.path,
    workflowRef: workflow.ref,
  };
}

export function parseExecutionApprovalEvidence(
  commentBody: string,
): ExecutionApprovalEvidence | null {
  const marker = parseBatchTrailMarker(commentBody, "execution-approval");
  const decision = marker.get("decision");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");

  if (
    (decision !== "APPROVED" && decision !== "REJECTED") ||
    !requestId ||
    !batchId ||
    !requestDigest
  ) {
    return null;
  }

  return {
    batchId,
    decision,
    requestDigest,
    requestId,
  };
}

function parseBatchTrailMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batchtrail:${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function parseCanonicalPayload(issueBody: string): unknown {
  const match = issueBody.match(/```json\s*([\s\S]*?)```/);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function readWorkflowTarget(payload: unknown): { path: string; ref: string } {
  if (!payload || typeof payload !== "object") {
    return { path: "", ref: "" };
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return { path: "", ref: "" };
  }

  const workflow = (spec as { workflow?: unknown }).workflow;

  if (!workflow || typeof workflow !== "object") {
    return { path: "", ref: "" };
  }

  const path = (workflow as { path?: unknown }).path;
  const ref = (workflow as { ref?: unknown }).ref;

  return {
    path: typeof path === "string" ? path : "",
    ref: typeof ref === "string" ? ref : "",
  };
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

function isExpired(expiresAt: string, now: Date): boolean {
  const expiresAtTime = Date.parse(expiresAt);

  if (Number.isNaN(expiresAtTime)) {
    return false;
  }

  return expiresAtTime <= now.getTime();
}
